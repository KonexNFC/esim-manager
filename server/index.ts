import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { WebhookHandlers } from "./webhookHandlers";
import { handleCheckoutCompleted, handlePaymentFailed } from "./services/stripeService";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─── Stripe webhook MUST be registered before express.json() ─────────────────
// It needs the raw Buffer body for signature verification.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });

    const sig = Array.isArray(signature) ? signature[0] : signature;

    try {
      // Idempotency: check if we've already processed this event
      // stripe-replit-sync handles this internally, but we also track it ourselves
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      // Parse the event to apply our business logic
      // We do this AFTER stripe-replit-sync processes it (sync to stripe.* tables)
      try {
        const { getUncachableStripeClient } = await import("./stripeClient");
        const stripe = await getUncachableStripeClient();
        const event = stripe.webhooks.constructEvent(req.body as Buffer, sig,
          // Webhook secret is managed by stripe-replit-sync; fallback to env
          process.env.STRIPE_WEBHOOK_SECRET || ""
        );

        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as any;

            // Idempotency: check payment event log
            const existing = await storage.getPaymentEvent(event.id);
            if (!existing) {
              await storage.createPaymentEvent({
                externalEventId: event.id,
                eventType: event.type,
                payloadJson: { sessionId: session.id, metadata: session.metadata },
              });
              await handleCheckoutCompleted(session);
              await storage.markPaymentEventProcessed(event.id);
            } else {
              console.log(`[Webhook] Event ${event.id} already processed — skipping`);
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const pi = event.data.object as any;
            await handlePaymentFailed({ metadata: {}, customer_details: { email: pi.receipt_email } });
            break;
          }

          default:
            console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }
      } catch (bizErr: any) {
        // Business logic errors shouldn't affect the 200 response to Stripe
        console.error("[Webhook] Business logic error:", bizErr.message);
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("[Webhook] Error:", error.message);
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// ─── Standard middleware (AFTER webhook route) ────────────────────────────────
app.use(cookieParser());
app.use(
  express.json({
    verify: (_req, _res, buf) => {
      (_req as any).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

// ─── Initialize Stripe schema and sync ───────────────────────────────────────
async function initStripe() {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.warn("[Stripe] DATABASE_URL not set — skipping Stripe init");
      return;
    }

    await runMigrations({ databaseUrl, schema: "stripe" });
    console.log("[Stripe] Schema ready");

    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();

    const domains = process.env.REPLIT_DOMAINS?.split(",");
    if (domains && domains[0]) {
      const webhookUrl = `https://${domains[0]}/api/stripe/webhook`;
      const { webhook } = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      console.log("[Stripe] Webhook configured:", webhook?.url || webhookUrl);
    }

    // Run backfill async so it doesn't delay startup
    stripeSync.syncBackfill()
      .then(() => console.log("[Stripe] Backfill complete"))
      .catch((err: any) => console.error("[Stripe] Backfill error:", err.message));
  } catch (err: any) {
    // Non-fatal — app works without Stripe in dev when connection isn't set up
    console.warn("[Stripe] Init skipped:", err.message);
  }
}

(async () => {
  await seedDatabase().catch((err) => {
    console.error("Seed error:", err);
  });

  await initStripe();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => { log(`serving on port ${port}`); }
  );
})();
