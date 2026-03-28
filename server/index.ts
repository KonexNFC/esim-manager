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

// ─── Stripe webhook MUST be registered before express.json() ─────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      console.warn("[Webhook] Missing stripe-signature header");
      return res.status(400).json({ error: "Missing stripe-signature" });
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    // Always acknowledge Stripe first — process business logic async
    res.status(200).json({ received: true });

    // ── stripe-replit-sync processing (non-blocking) ──────────────────────
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
    } catch (syncErr: any) {
      console.error("[Webhook] stripe-replit-sync error:", syncErr.message);
    }

    // ── Business logic: parse event and apply state transitions ──────────
    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      let event: any;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET ?? ""
        );
      } catch (parseErr: any) {
        // Signature check fails if STRIPE_WEBHOOK_SECRET is wrong / not set.
        // In that case, parse the event without verification (dev-mode only).
        if (process.env.NODE_ENV !== "production") {
          console.warn("[Webhook] Signature check failed (dev mode) — parsing raw JSON");
          event = JSON.parse((req.body as Buffer).toString());
        } else {
          console.error("[Webhook] Signature verification failed:", parseErr.message);
          return;
        }
      }

      await dispatchWebhookEvent(event);
    } catch (err: any) {
      console.error("[Webhook] Business logic error:", err.message);
    }
  }
);

// ─── Event dispatcher ─────────────────────────────────────────────────────────
async function dispatchWebhookEvent(event: any): Promise<void> {
  const eventId = event.id ?? `evt_${Date.now()}`;

  // Idempotency check
  const existing = await storage.getPaymentEvent(eventId).catch(() => null);
  if (existing?.status === "processed") {
    console.log(`[Webhook] Event ${eventId} already processed — skipping`);
    return;
  }

  // Record the event (upsert-style: only create if not already present)
  if (!existing) {
    await storage.createPaymentEvent({
      externalEventId: eventId,
      eventType: event.type,
      payloadJson: { type: event.type, objectId: event.data?.object?.id },
    }).catch(() => {/* duplicate key — already recorded */});
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`[Webhook] checkout.session.completed — session=${session.id} status=${session.payment_status}`);
        if (session.payment_status === "paid") {
          await handleCheckoutCompleted(session);
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        console.log(`[Webhook] async_payment_succeeded — session=${session.id}`);
        await handleCheckoutCompleted(session);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const obj = event.data.object;
        console.log(`[Webhook] Payment failed — ${event.type}`);
        await handlePaymentFailed(obj);
        break;
      }
      default:
        // Unhandled events are fine — just log them
        console.log(`[Webhook] Ignored event: ${event.type}`);
    }

    await storage.markPaymentEventProcessed(eventId);
  } catch (err: any) {
    console.error(`[Webhook] Event ${eventId} processing failed:`, err.message);
    // Mark as failed so it can be retried manually
    await storage.updatePaymentEventStatus(eventId, "failed").catch(() => {});
    throw err; // rethrow so caller knows
  }
}

// ─── Standard middleware (AFTER webhook route) ────────────────────────────────
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        const preview = JSON.stringify(capturedJsonResponse);
        if (preview.length < 300) logLine += ` :: ${preview}`;
      }
      log(logLine);
    }
  });

  next();
});

// ─── Stripe initialization ────────────────────────────────────────────────────
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
    if (domains?.[0]) {
      const webhookUrl = `https://${domains[0]}/api/stripe/webhook`;
      const { webhook } = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      console.log("[Stripe] Webhook configured:", webhook?.url ?? webhookUrl);
    }

    // Async backfill — doesn't block startup
    stripeSync.syncBackfill()
      .then(() => console.log("[Stripe] Backfill complete"))
      .catch((err: any) => console.error("[Stripe] Backfill error:", err.message));
  } catch (err: any) {
    console.warn("[Stripe] Init skipped:", err.message);
  }
}

(async () => {
  await seedDatabase().catch(err => console.error("Seed error:", err));
  await initStripe();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Unhandled error:", err);
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
