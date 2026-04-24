import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

// ─── Paddle webhook (raw body required) ───────────────────────────────────────
app.post(
  "/api/webhooks/paddle",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // Acknowledge immediately
    res.status(200).json({ received: true });

    try {
      const rawBody = (req.body as Buffer).toString("utf-8");
      const event = JSON.parse(rawBody);
      const signature = (req.headers["paddle-signature"] as string) ?? "";

      // Verify signature in production
      if (process.env.NODE_ENV === "production" && process.env.PADDLE_WEBHOOK_SECRET) {
        const { verifyPaddleWebhook } = await import("./services/paddleService");
        if (!verifyPaddleWebhook(rawBody, signature)) {
          console.warn("[Paddle] Webhook signature verification failed");
          return;
        }
      }

      const eventType: string = event.event_type ?? event.notification_type ?? "";
      const data = event.data ?? event;
      const transactionId: string = data.id ?? data.transaction_id ?? "";

      console.log(`[Paddle] Event: ${eventType} | transaction=${transactionId}`);

      if (eventType === "transaction.completed" || eventType === "payment.completed") {
        await handlePaddleTransactionCompleted(data);
      }
    } catch (err: any) {
      console.error("[Paddle] Webhook error:", err.message);
    }
  }
);

async function handlePaddleTransactionCompleted(data: any) {
  try {
    const transactionId: string = data.id ?? data.transaction_id ?? "";
    const customData: Record<string, string> = data.custom_data ?? {};
    const email: string =
      data.customer?.email ??
      customData.email ??
      data.billing_details?.email ??
      "";
    const amountUsd: number =
      parseFloat(data.details?.totals?.subtotal ?? "0") / 100 ||
      parseFloat(customData.amountUsd ?? "0");

    const normalizedPlanId: string = customData.normalizedPlanId ?? "";
    const countryCode: string = customData.countryCode ?? "";

    // Idempotency check
    const eventId = `paddle_${transactionId}`;
    const existing = await storage.getPaymentEvent(eventId).catch(() => null);
    if (existing?.status === "processed") {
      console.log(`[Paddle] Event ${eventId} already processed`);
      return;
    }

    if (!existing) {
      await storage.createPaymentEvent({
        externalEventId: eventId,
        eventType: "transaction.completed",
        payloadJson: { type: "transaction.completed", objectId: transactionId },
      }).catch(() => {});
    }

    // Create order record
    const { db } = await import("./storage");
    const { orders, users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    let resolvedUserId: string | undefined;
    if (email) {
      const [user] = await (db as any).select().from(users).where(eq(users.email, email));
      if (user) resolvedUserId = user.id;
    }

    const { fulfillInitialPurchase } = await import("./services/fulfillment");

    const [order] = await (db as any).insert(orders).values({
      planId: null,
      normalizedPlanId: normalizedPlanId || null,
      email,
      userId: resolvedUserId ?? null,
      status: "paid",
      totalPrice: amountUsd,
      currency: "USD",
      providerName: customData.providerKey ?? "paddle",
      purchaseType: "initial_purchase",
      selectedProviderKey: customData.providerKey ?? null,
      wholesaleCostUsd: customData.wholesaleCostUsd ? parseFloat(customData.wholesaleCostUsd) : null,
    }).returning();

    await storage.markPaymentEventProcessed(eventId);
    console.log(`[Paddle] Order ${order.id} created — fulfilling...`);
    await fulfillInitialPurchase(order.id);
  } catch (err: any) {
    console.error("[Paddle] handleTransactionCompleted error:", err.message);
  }
}

// ─── Standard middleware ───────────────────────────────────────────────────────
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

(async () => {
  await seedDatabase().catch(err => console.error("Seed error:", err));
  await registerRoutes(httpServer, app);

  const { startProviderSyncScheduler } = await import("./services/providerSync");
  startProviderSyncScheduler();

  // ── Startup recovery: re-trigger orders stuck in "fulfilling" ─────────────
  // These are orders where capture succeeded but the async fulfillment task
  // was interrupted (e.g. deploy / process restart). Give the server 5 s to
  // finish booting before re-triggering to avoid DB race conditions.
  setTimeout(async () => {
    try {
      const { db } = await import("./storage");
      const { orders: ordersTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { fulfillInitialPurchase } = await import("./services/fulfillment");

      const stuckOrders = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(eq(ordersTable.status, "fulfilling"));

      if (stuckOrders.length > 0) {
        console.log(`[Startup] Found ${stuckOrders.length} order(s) stuck in "fulfilling" — resetting and re-triggering...`);
        for (const { id } of stuckOrders) {
          // Reset to "paid" so fulfillInitialPurchase doesn't skip it
          await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, id));
          console.log(`[Startup] Re-triggering fulfillment for order ${id}`);
          fulfillInitialPurchase(id).catch((err: any) =>
            console.error(`[Startup] Re-fulfillment error for order ${id}:`, err.message)
          );
        }
      }
    } catch (err: any) {
      console.error("[Startup] Recovery check failed:", err.message);
    }
  }, 5_000);

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
