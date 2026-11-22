import "./services/fatalDiagnostics";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

// This endpoint deliberately avoids the database and supplier APIs so platform
// monitoring can distinguish process health from a downstream dependency issue.
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// ─── Stripe webhook (raw body required — must be before express.json()) ────────
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    res.status(200).json({ received: true });

    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      let event: import("stripe").default.Event;
      const sig = req.headers["stripe-signature"] as string;
      const secret = process.env.STRIPE_WEBHOOK_SECRET;

      if (secret && sig) {
        try {
          event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
        } catch (err: any) {
          console.warn("[Stripe] Webhook signature verification failed:", err.message);
          return;
        }
      } else if (process.env.NODE_ENV !== "production") {
        // No secret configured — parse payload directly (dev mode)
        event = JSON.parse((req.body as Buffer).toString("utf-8"));
      } else {
        console.error("[Stripe] Ignoring production webhook without a configured signing secret and signature");
        return;
      }

      console.log(`[Stripe] Webhook event: ${event.type}`);

      const { handleCheckoutCompleted, handlePaymentFailed } = await import("./services/stripeService");

      if (event.type === "checkout.session.completed") {
        await handleCheckoutCompleted(event.data.object);
      } else if (event.type === "checkout.session.async_payment_failed" || event.type === "payment_intent.payment_failed") {
        await handlePaymentFailed(event.data.object);
      }
    } catch (err: any) {
      console.error("[Stripe] Webhook error:", err.message);
    }
  }
);

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

       // Production payment events must always be signed.
       if (process.env.NODE_ENV === "production") {
         if (!process.env.PADDLE_WEBHOOK_SECRET) {
           console.error("[Paddle] Ignoring production webhook without a configured signing secret");
           return;
         }
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
    // Amount ACTUALLY captured (grand_total/total after all discounts) — never
    // a client value or quote metadata fallback.
    const { paddleCapturedUsd } = await import("./services/priceFloor");
    const capturedUsd = paddleCapturedUsd(data.details?.totals, null);
    const amountUsd: number = capturedUsd ?? 0;

    let normalizedPlanId: string = customData.normalizedPlanId ?? "";
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

    // Verify the exact signed quote and its current selected-offer mapping before
    // fulfillment. Paddle must report a real USD grand total; metadata cannot
    // substitute for captured evidence.
    let quoteFailure: string | null = null;
    let quote: any = null;
    try {
      const { validateCheckoutQuoteForPayment, quoteMatchesCapture } = await import("./services/checkoutQuote");
      quote = await validateCheckoutQuoteForPayment(customData.quoteToken);
      const capturedCurrency = String(
        data.currency_code ??
        data.details?.totals?.currency_code ??
        data.details?.totals?.currency ??
        "",
      );
      if (!quoteMatchesCapture(quote, Math.round(amountUsd * 100), capturedCurrency)) {
        quoteFailure = "Paddle captured an amount or currency that does not match the approved quote.";
      }
      if (normalizedPlanId && normalizedPlanId !== quote.normalizedPlanId) {
        quoteFailure = "Paddle checkout plan does not match the approved quote.";
      }
      normalizedPlanId = quote.normalizedPlanId;
    } catch (err: any) {
      quoteFailure = err.message || "Checkout quote is invalid or expired.";
    }

    // Create order record
    const { db } = await import("./storage");
    const { orders, users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    // Resume a refund after a transient failure instead of creating a duplicate
    // rejected order when Paddle retries this same completed transaction.
    const [existingOrder] = await (db as any).select().from(orders)
      .where(eq(orders.paddleTransactionId, transactionId));
    if (existingOrder) {
      if (existingOrder.status === "rejected_below_floor") {
        const { refundRejectedPayment } = await import("./services/rejectedPaymentRefund");
        await refundRejectedPayment(existingOrder);
      }
      await storage.markPaymentEventProcessed(eventId);
      return;
    }

    let resolvedUserId: string | undefined;
    if (email) {
      const [user] = await (db as any).select().from(users).where(eq(users.email, email));
      if (user) resolvedUserId = user.id;
    }

    const rejectAndRefundPaddlePayment = async () => {
      const [rejected] = await (db as any).insert(orders).values({
        planId: null,
        normalizedPlanId: normalizedPlanId || null,
        email,
        userId: resolvedUserId ?? null,
        status: "rejected_below_floor",
        totalPrice: amountUsd,
        currency: "USD",
        providerName: "paddle",
        purchaseType: "initial_purchase",
        paddleTransactionId: transactionId,
        selectedProviderKey: quote?.fallbackChain?.[0]?.k ?? null,
        fallbackProvidersJson: quote?.fallbackChain ?? null,
        wholesaleCostUsd: quote?.fallbackChain?.[0]?.w ?? null,
      }).returning();
      const { refundRejectedPayment } = await import("./services/rejectedPaymentRefund");
      await refundRejectedPayment(rejected);
      await storage.markPaymentEventProcessed(eventId);
    };

    // ── Wholesale price floor guard: never fulfill a below-cost payment ────
    // Quote validation above has rechecked one concrete supplier SKU. Do not
    // broaden this to unrelated offers in the normalized group.
    if (normalizedPlanId && !quoteFailure) {
        const { assertPaddleCapturedPayment, PriceFloorError } =
        await import("./services/priceFloor");
      try {
        const wholesale = quote?.fallbackChain?.[0]?.w;
        if (wholesale == null) {
          throw new PriceFloorError(
            `Paddle transaction ${transactionId}: approved quote has no selected wholesale evidence.`,
          );
        }
          assertPaddleCapturedPayment(
            data.details?.totals,
            wholesale,
            `Paddle transaction ${transactionId}`,
          );
      } catch (floorErr: any) {
        if (floorErr instanceof PriceFloorError) {
          console.error(`[Paddle] REJECTED below-floor payment: ${floorErr.message}`);
          await rejectAndRefundPaddlePayment();
          return;
        }
        throw floorErr;
      }
    }

    if (quoteFailure) {
      console.error(`[Paddle] REJECTED quote mismatch: ${quoteFailure}`);
      await rejectAndRefundPaddlePayment();
      return;
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
      providerName: "paddle",
      purchaseType: "initial_purchase",
      paddleTransactionId: transactionId,
      selectedProviderKey: quote?.fallbackChain?.[0]?.k ?? customData.selectedProviderKey ?? null,
      fallbackProvidersJson: quote?.fallbackChain ?? null,
      wholesaleCostUsd: quote?.fallbackChain?.[0]?.w ?? null,
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
  await registerRoutes(httpServer, app);

  const { startProviderSyncScheduler } = await import("./services/providerSync");
  startProviderSyncScheduler();
  const { startProviderBalanceScheduler } = await import("./services/providerBalance");
  // Health is persisted and evaluated fail-closed when unknown, stale, or down.
  // Refresh it in the background so slow supplier APIs cannot block the HTTP
  // listener during an Autoscale cold start.
  startProviderBalanceScheduler();
  const { startZenditReconciliationScheduler } = await import("./services/fulfillment");
  startZenditReconciliationScheduler();
  const { startEsimNotificationScheduler } = await import("./services/esimNotificationOutbox");
  startEsimNotificationScheduler();

  // ── Startup recovery: re-trigger orders stuck in "fulfilling" ─────────────
  // These are orders where capture succeeded but the async fulfillment task
  // was interrupted (e.g. deploy / process restart). Give the server 5 s to
  // finish booting before re-triggering to avoid DB race conditions.
  //
  // SAFETY: Only retry orders that started fulfilling in the last 10 minutes.
  // Older stuck orders are from previous crashes and have likely already been
  // purchased from the provider — retrying them would cause duplicate charges.
  // Those are marked fulfillment_failed instead so they can be handled manually.
  setTimeout(async () => {
    try {
      const { db } = await import("./storage");
      const { orders: ordersTable } = await import("@shared/schema");
      const { eq, and, gt, lte, sql: drizzleSql } = await import("drizzle-orm");
      const { fulfillInitialPurchase } = await import("./services/fulfillment");

      const RETRY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
      const cutoff = new Date(Date.now() - RETRY_WINDOW_MS);

      const stuckOrders = await db
        .select({
          id: ordersTable.id,
          updatedAt: ordersTable.updatedAt,
          iccid: ordersTable.iccid,
          providerName: ordersTable.providerName,
          providerEsimId: ordersTable.providerEsimId,
        })
        .from(ordersTable)
        .where(eq(ordersTable.status, "fulfilling"));

      if (stuckOrders.length > 0) {
        console.log(`[Startup] Found ${stuckOrders.length} order(s) stuck in "fulfilling"`);
      }

      for (const order of stuckOrders) {
        const ageMs = Date.now() - new Date(order.updatedAt ?? 0).getTime();
        const ageMin = Math.round(ageMs / 60_000);

        // If the order already has an ICCID, a provider purchased it successfully —
        // don't buy again. Just mark as fulfilled so the customer gets their eSIM.
        if (order.iccid) {
          console.log(`[Startup] Order ${order.id} has ICCID ${order.iccid} — marking fulfilled without re-purchase`);
          await db.update(ordersTable)
            .set({ status: "fulfilled", esimStatus: "issued" })
            .where(eq(ordersTable.id, order.id));
          continue;
        }

        // Zendit's transaction ID is persisted before the purchase request.
        // Its presence means a purchase may already exist, so normal
        // re-fulfillment is unsafe even after a process restart.
        if (order.providerName === "zendit" && order.providerEsimId) {
          console.log(`[Startup] Zendit order ${order.id} has transaction ${order.providerEsimId} — queueing reconciliation`);
          await db.update(ordersTable)
            .set({ status: "fulfillment_pending", esimStatus: "pending", updatedAt: new Date() })
            .where(eq(ordersTable.id, order.id));
          continue;
        }

        if (ageMs > RETRY_WINDOW_MS) {
          // Too old — almost certainly a crash from a prior server run.
          // Marking as failed rather than re-purchasing to avoid duplicate charges.
          console.warn(`[Startup] Order ${order.id} stuck for ${ageMin}min — marking fulfillment_failed (no retry to prevent duplicate charges)`);
          await db.update(ordersTable)
            .set({ status: "fulfillment_failed", esimStatus: "not_issued" })
            .where(eq(ordersTable.id, order.id));
        } else {
          // Recent — safe to retry (server likely restarted mid-flight)
          console.log(`[Startup] Order ${order.id} stuck for ${ageMin}min — resetting to paid and retrying`);
          await db.update(ordersTable).set({ status: "paid" }).where(eq(ordersTable.id, order.id));
          fulfillInitialPurchase(order.id).catch((err: any) =>
            console.error(`[Startup] Re-fulfillment error for order ${order.id}:`, err.message)
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
    () => {
      log(`serving on port ${port}`);
      // Seeding is idempotent and not required to serve the static app or health
      // endpoint. Keeping it off the critical startup path prevents a paused or
      // slow database from making the entire deployment fail its uptime check.
      void seedDatabase().catch(err => console.error("Seed error:", err));
    }
  );

  // ── DB keepalive: prevents Replit's managed PostgreSQL from freezing ─────────
  // Pings every 4 minutes. If the DB is unreachable 5 pings in a row (~20 min)
  // the process exits so Replit auto-restarts it with a fresh connection pool.
  const DB_KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
  const MAX_CONSECUTIVE_FAILURES = 5;
  let _keepaliveFailures = 0;

  setInterval(async () => {
    try {
      const { db } = await import("./storage");
      const { sql: drizzleSql } = await import("drizzle-orm");
      await db.execute(drizzleSql`SELECT 1`);
      if (_keepaliveFailures > 0) {
        console.log(`[keepalive] DB reconnected after ${_keepaliveFailures} failed ping(s)`);
      }
      _keepaliveFailures = 0;
    } catch (err: any) {
      _keepaliveFailures++;
      console.warn(`[keepalive] DB ping failed (${_keepaliveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, err.message);
      if (_keepaliveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[keepalive] DB unreachable for ${MAX_CONSECUTIVE_FAILURES} consecutive pings — forcing restart to clear hung connections`);
        process.exit(1); // Replit will auto-restart the app
      }
    }
  }, DB_KEEPALIVE_INTERVAL_MS);
})();
