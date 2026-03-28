import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema, insertPlanSchema } from "@shared/schema";
import { fetchProviderPlans, getBestPlan } from "./providers";
import { purchaseEsim as providerPurchase, getAvailableProviders } from "./providers/providerManager";
import { z } from "zod";
import {
  hashPassword, verifyPassword, signToken, verifyToken,
  setAuthCookie, clearAuthCookie, getTokenFromRequest, requireAuth,
} from "./auth";
import {
  createPlanCheckoutSession,
  createTopupCheckoutSession,
  getStripePublishableKey as _getStripePublishableKey,
} from "./services/stripeService";
import { syncEsimUsage, syncUserEsims, syncAllActiveEsims } from "./services/usageSync";
import { getActiveProvider } from "./providers/adapters";

// ─── Schemas ─────────────────────────────────────────
const bestPlanSchema = z.object({
  countryCode: z.string().min(2).max(3),
  dataAmountGb: z.number().positive(),
  validityDays: z.number().int().positive(),
});

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

const planCheckoutSchema = z.object({
  planId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  upsellOptionId: z.string().optional(),
});

const topupCheckoutSchema = z.object({
  orderId: z.string(),
  optionCode: z.string(),
  email: z.string().email(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── AUTH ────────────────────────────────────────────
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

      const { name, email, password } = parsed.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "An account with this email already exists" });

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({ name, email, passwordHash });
      await storage.linkOrdersToUser(email, user.id);

      const token = signToken(user.id, user.email);
      setAuthCookie(res, token);
      res.status(201).json({ id: user.id, name: user.name, email: user.email });
    } catch (error) {
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });

      const { email, password } = parsed.data;
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ message: "Invalid email or password" });

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      await storage.linkOrdersToUser(email, user.id);
      const token = signToken(user.id, user.email);
      setAuthCookie(res, token);
      res.json({ id: user.id, name: user.name, email: user.email });
    } catch (error) {
      res.status(500).json({ message: "Failed to log in" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearAuthCookie(res);
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ message: "Not authenticated" });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ message: "Invalid session" });

    try {
      const user = await storage.getUserById(payload.userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      res.json({ id: user.id, name: user.name, email: user.email });
    } catch {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });

      const { name, currentPassword, newPassword } = parsed.data;
      const updates: Record<string, string> = {};

      if (name) updates.name = name;

      if (currentPassword && newPassword) {
        const user = await storage.getUserById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        const valid = await verifyPassword(currentPassword, user.passwordHash);
        if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
        updates.passwordHash = await hashPassword(newPassword);
      }

      const updated = await storage.updateUser(userId, updates);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ id: updated.id, name: updated.name, email: updated.email });
    } catch {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ─── DASHBOARD ───────────────────────────────────────
  app.get("/api/dashboard/orders", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const userOrders = await storage.getOrdersByUserId(userId);
      res.json(userOrders);
    } catch {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Legacy mock top-up kept for dashboard UI compatibility
  app.post("/api/dashboard/topup/:orderId", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    const { orderId } = req.params;
    const { topupType } = req.body;

    const topupOptions: Record<string, { label: string; price: number }> = {
      "1gb":       { label: "+1 GB",       price: 3.00 },
      "3gb":       { label: "+3 GB",       price: 7.00 },
      "5gb":       { label: "+5 GB",       price: 11.00 },
      "unlimited": { label: "Unlimited",   price: 15.00 },
      "7days":     { label: "+7 Days",     price: 5.00 },
      "30days":    { label: "+30 Days",    price: 12.00 },
    };

    const option = topupOptions[topupType];
    if (!option) return res.status(400).json({ message: "Invalid top-up type" });

    try {
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      res.json({
        success: true,
        message: `Top-up successful: ${option.label} added to your eSIM`,
        topupType,
        price: option.price,
      });
    } catch {
      res.status(500).json({ message: "Failed to process top-up" });
    }
  });

  // ─── STRIPE CHECKOUT ─────────────────────────────────

  // GET /api/stripe/config — publishable key for frontend
  app.get("/api/stripe/config", async (_req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch {
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  // POST /api/checkout/plan — create Stripe checkout for a plan purchase
  app.post("/api/checkout/plan", async (req, res) => {
    try {
      const parsed = planCheckoutSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

      const { planId, email, name, upsellOptionId } = parsed.data;

      const plan = await storage.getPlan(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const destination = await storage.getDestination(plan.destinationId);

      // Get user if authenticated
      let userId: string | undefined;
      const token = getTokenFromRequest(req);
      if (token) {
        const payload = verifyToken(token);
        if (payload) userId = payload.userId;
      }

      // Upsell price map (server-authoritative)
      const upsellMap: Record<string, { dataGb: number; price: number }> = {
        "1gb":       { dataGb: 1,  price: 3.00 },
        "3gb":       { dataGb: 3,  price: 7.00 },
        "5gb":       { dataGb: 5,  price: 11.00 },
        "unlimited": { dataGb: 0,  price: 15.00 },
      };
      const upsell = upsellOptionId ? upsellMap[upsellOptionId] : undefined;

      const { url, sessionId } = await createPlanCheckoutSession({
        planId: plan.id,
        planName: plan.name,
        destination: destination?.name || 'Unknown',
        region: destination?.region || plan.coverage,
        dataAmount: plan.dataAmount,
        validity: plan.validity,
        dataAmountGb: plan.dataAmountGb,
        validityDays: plan.validityDays,
        price: plan.price,
        currency: plan.currency,
        email,
        userId,
        userName: name,
        upsellDataGb: upsell?.dataGb,
        upsellPrice: upsell?.price,
      });

      res.json({ url, sessionId });
    } catch (error: any) {
      console.error('[checkout/plan]', error.message);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // POST /api/checkout/topup — create Stripe checkout for a top-up
  app.post("/api/checkout/topup", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const parsed = topupCheckoutSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

      const { orderId, optionCode, email } = parsed.data;
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      const provider = getActiveProvider();
      const options = await provider.getTopupOptions(order.providerEsimId || '');
      const option = options.find(o => o.optionCode === optionCode);
      if (!option) return res.status(400).json({ message: "Invalid top-up option" });

      const { url, sessionId, topupId } = await createTopupCheckoutSession({
        orderId,
        optionCode,
        optionName: option.name,
        price: option.price,
        currency: option.currency,
        email,
        userId,
      });

      res.json({ url, sessionId, topupId });
    } catch (error: any) {
      console.error('[checkout/topup]', error.message);
      res.status(500).json({ message: "Failed to create top-up checkout session" });
    }
  });

  // GET /api/checkout/session/:sessionId — verify a completed session
  app.get("/api/checkout/session/:sessionId", async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
      res.json({
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email,
        metadata: session.metadata,
        amountTotal: session.amount_total,
        currency: session.currency,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to retrieve session" });
    }
  });

  // ─── eSIMS (customer) ────────────────────────────────

  // GET /api/esims — all eSIMs for authenticated user
  app.get("/api/esims", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const userOrders = await storage.getOrdersByUserId(userId);
      res.json(userOrders);
    } catch {
      res.status(500).json({ message: "Failed to fetch eSIMs" });
    }
  });

  // GET /api/esims/:id — single eSIM detail
  app.get("/api/esims/:id", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "eSIM not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Not authorized" });
      res.json(order);
    } catch {
      res.status(500).json({ message: "Failed to fetch eSIM" });
    }
  });

  // GET /api/esims/:id/usage — live usage sync
  app.get("/api/esims/:id/usage", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "eSIM not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      await syncEsimUsage(req.params.id);
      const updated = await storage.getOrder(req.params.id);
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Failed to sync usage" });
    }
  });

  // GET /api/esims/:id/topups/options — get available top-up options
  app.get("/api/esims/:id/topups/options", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "eSIM not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      const provider = getActiveProvider();
      const options = await provider.getTopupOptions(order.providerEsimId || '');
      res.json(options);
    } catch {
      res.status(500).json({ message: "Failed to fetch top-up options" });
    }
  });

  // POST /api/esims/:id/topups/checkout — initiate Stripe top-up checkout
  app.post("/api/esims/:id/topups/checkout", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "eSIM not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Not authorized" });

      const user = await storage.getUserById(userId);
      const parsed = z.object({ optionCode: z.string() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "optionCode required" });

      const provider = getActiveProvider();
      const options = await provider.getTopupOptions(order.providerEsimId || '');
      const option = options.find(o => o.optionCode === parsed.data.optionCode);
      if (!option) return res.status(400).json({ message: "Invalid top-up option" });

      const { url, sessionId, topupId } = await createTopupCheckoutSession({
        orderId: order.id,
        optionCode: option.optionCode,
        optionName: option.name,
        price: option.price,
        currency: option.currency,
        email: user?.email || order.email,
        userId,
      });

      res.json({ url, sessionId, topupId });
    } catch (error: any) {
      console.error('[esims/topups/checkout]', error.message);
      res.status(500).json({ message: "Failed to create top-up checkout" });
    }
  });

  // ─── DESTINATIONS ────────────────────────────────────
  app.get("/api/destinations", async (req, res) => {
    try {
      const popular = req.query.popular === "true";
      const dests = popular
        ? await storage.getPopularDestinations()
        : await storage.getDestinations();
      res.json(dests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  app.get("/api/destinations/:id", async (req, res) => {
    try {
      const dest = await storage.getDestination(req.params.id);
      if (!dest) return res.status(404).json({ message: "Destination not found" });
      res.json(dest);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch destination" });
    }
  });

  // ─── PLANS ────────────────────────────────────────────
  app.get("/api/plans", async (req, res) => {
    try {
      const destinationId = req.query.destinationId as string;
      if (destinationId) {
        const result = await storage.getPlans(destinationId);
        return res.json(result);
      }
      const all = await storage.getAllPlans();
      res.json(all);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  app.get("/api/plans/:id", async (req, res) => {
    try {
      const plan = await storage.getPlan(req.params.id);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      res.json(plan);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch plan" });
    }
  });

  app.post("/api/plans", async (req, res) => {
    try {
      const parsed = insertPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid plan data", errors: parsed.error.flatten() });
      }
      const plan = await storage.createPlan(parsed.data);
      res.status(201).json(plan);
    } catch (error) {
      res.status(500).json({ message: "Failed to create plan" });
    }
  });

  app.patch("/api/plans/:id", async (req, res) => {
    try {
      const updated = await storage.updatePlan(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Plan not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  // ─── ORDERS ──────────────────────────────────────────
  app.get("/api/orders", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (email) {
        const result = await storage.getOrdersByEmail(email);
        return res.json(result);
      }
      const all = await storage.getAllOrders();
      res.json(all);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // POST /api/orders — legacy direct order creation (non-Stripe path, kept for admin/testing)
  app.post("/api/orders", async (req, res) => {
    try {
      const parsed = insertOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid order data", errors: parsed.error.flatten() });
      }
      const plan = await storage.getPlan(parsed.data.planId);
      if (!plan) {
        return res.status(400).json({ message: "Invalid plan ID" });
      }

      let providerResult: { iccid?: string; qrCodeUrl?: string } = {};

      if (plan.provider && plan.provider !== "manual") {
        try {
          const result = await providerPurchase(plan.id, plan.provider);
          providerResult = { iccid: result.iccid, qrCodeUrl: result.qrCodeUrl };
        } catch (err) {
          console.log(`[orders] Provider ${plan.provider} purchase failed, falling back to manual:`, err);
        }
      }

      let userId: string | undefined;
      const token = getTokenFromRequest(req);
      if (token) {
        const payload = verifyToken(token);
        if (payload) userId = payload.userId;
      }
      if (!userId) {
        const existingUser = await storage.getUserByEmail(parsed.data.email);
        if (existingUser) userId = existingUser.id;
      }

      const orderData = userId ? { ...parsed.data, userId } : parsed.data;
      const order = await storage.createOrder(orderData, providerResult.iccid, providerResult.qrCodeUrl);
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const updated = await storage.updateOrder(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Order not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  // ─── PROVIDERS ────────────────────────────────────────
  app.get("/api/providers/plans", async (req, res) => {
    try {
      const countryCode = req.query.countryCode as string;
      if (!countryCode) {
        return res.status(400).json({ message: "countryCode query param required" });
      }
      const plans = await fetchProviderPlans(countryCode);
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch provider plans" });
    }
  });

  app.post("/api/providers/best-plan", async (req, res) => {
    try {
      const parsed = bestPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      const { countryCode, dataAmountGb, validityDays } = parsed.data;
      const best = await getBestPlan(countryCode, dataAmountGb, validityDays);
      if (!best) {
        return res.json({ bestPlan: null, message: "No provider plans available — using manual plans" });
      }
      res.json({ bestPlan: best });
    } catch (error) {
      res.status(500).json({ message: "Failed to find best plan" });
    }
  });

  app.get("/api/providers/available", async (_req, res) => {
    try {
      res.json({ providers: getAvailableProviders() });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch providers" });
    }
  });

  // ─── GIFT eSIM ────────────────────────────────────────
  app.post("/api/gift", async (req, res) => {
    try {
      const schema = z.object({
        planId: z.string().uuid(),
        senderEmail: z.string().email(),
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        message: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

      const { planId } = parsed.data;
      const plan = await storage.getPlan(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      res.status(202).json({
        success: true,
        message: "Gift eSIM request received. Recipient will be emailed a claim link.",
        status: "pending",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create gift eSIM" });
    }
  });

  // ─── FEATURES ─────────────────────────────────────────
  app.get("/api/features", (_req, res) => {
    res.json({
      dataRollover: { available: false, roadmapEta: "Q3 2026" },
      voiceCalling: { available: false, roadmapEta: "Q4 2026" },
      gifting: { available: true, endpoint: "POST /api/gift" },
    });
  });

  // ─── INTERNAL SYNC ────────────────────────────────────
  app.post("/api/internal/sync/esim/:orderId", async (req, res) => {
    try {
      await syncEsimUsage(req.params.orderId);
      const order = await storage.getOrder(req.params.orderId);
      res.json({ ok: true, order });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/sync/user/:userId", async (req, res) => {
    try {
      await syncUserEsims(req.params.userId);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/internal/sync/all-active", async (_req, res) => {
    try {
      syncAllActiveEsims().catch(console.error); // run async
      res.json({ ok: true, message: "Sync started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/internal/provider/health", async (_req, res) => {
    try {
      const provider = getActiveProvider();
      res.json({ provider: provider.name, status: "ok" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── ADMIN ────────────────────────────────────────────
  app.get("/api/admin/stats", async (_req, res) => {
    try {
      const [allOrders, allPlans, allDestinations] = await Promise.all([
        storage.getAllOrders(),
        storage.getAllPlans(),
        storage.getDestinations(),
      ]);

      const totalRevenue = allOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      const totalOrders = allOrders.length;
      const livePlans = allPlans.filter(p => p.planStatus === "live").length;
      const totalDestinations = allDestinations.length;

      const avgMargin = allPlans.reduce((sum, p) => {
        if (p.wholesaleCost && p.price > 0) {
          return sum + ((p.price - p.wholesaleCost) / p.price) * 100;
        }
        return sum;
      }, 0) / (allPlans.length || 1);

      res.json({
        totalRevenue,
        totalOrders,
        livePlans,
        totalDestinations,
        avgMargin: Math.round(avgMargin),
        activeEsims: allOrders.filter(o =>
          o.esimStatus === "active" || o.esimStatus === "installed" || o.esimStatus === "issued"
        ).length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  return httpServer;
}
