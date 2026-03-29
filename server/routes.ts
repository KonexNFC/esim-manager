import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./storage";
import { sql, eq } from "drizzle-orm";
import { insertOrderSchema, insertPlanSchema, settings } from "@shared/schema";
import { fetchProviderPlans, getBestPlan } from "./providers";
import { purchaseEsim as providerPurchase, getAvailableProviders } from "./providers/providerManager";
import { z } from "zod";
import {
  hashPassword, verifyPassword, signToken, verifyToken,
  setAuthCookie, clearAuthCookie, getTokenFromRequest, requireAuth, requireAdmin,
} from "./auth";
import {
  createPlanCheckoutSession,
  createTopupCheckoutSession,
} from "./services/stripeService";
import { syncEsimUsage, syncUserEsims, syncAllActiveEsims, runUsageSyncJob, findEsimsLowOnData, findEsimsExpiringSoon, findExpiredEsimsNeedingRenewal } from "./services/usageSync";
import { getActiveProvider } from "./providers/adapters";
import { calculateMargin } from "./services/marginEngine";

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

      const token = signToken(user.id, user.email, user.isAdmin);
      setAuthCookie(res, token);
      res.status(201).json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
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
      const token = signToken(user.id, user.email, user.isAdmin);
      setAuthCookie(res, token);
      res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
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
      res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
    } catch {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // GET /api/me — canonical alias matching spec (Section 12)
  app.get("/api/me", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin, authProvider: user.authProvider });
    } catch {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // POST /api/admin/promote — grant admin role to a user by email
  // Protected by ADMIN_SETUP_SECRET env var (for initial bootstrapping)
  // Once you have at least one admin, manage roles via PATCH /api/admin/users/:id
  app.post("/api/admin/promote", async (req, res) => {
    const setupSecret = process.env.ADMIN_SETUP_SECRET;
    if (!setupSecret) {
      return res.status(403).json({ message: "ADMIN_SETUP_SECRET not configured" });
    }
    const { email, secret } = req.body;
    if (!secret || secret !== setupSecret) {
      return res.status(403).json({ message: "Invalid setup secret" });
    }
    if (!email) return res.status(400).json({ message: "Email is required" });

    try {
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.updateUser(user.id, { isAdmin: true });
      res.json({ message: `${email} is now an admin. They must log out and back in for the change to take effect.` });
    } catch {
      res.status(500).json({ message: "Failed to promote user" });
    }
  });

  // PATCH /api/admin/users/:id — update a user's admin role (admin only)
  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { isAdmin } = req.body;
    if (typeof isAdmin !== "boolean") {
      return res.status(400).json({ message: "isAdmin must be a boolean" });
    }
    try {
      const user = await storage.updateUser(req.params.id, { isAdmin });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
    } catch {
      res.status(500).json({ message: "Failed to update user" });
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

  // GET /api/dashboard — full user dashboard summary (orders + esims + stats)
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    try {
      const [user, userOrders] = await Promise.all([
        storage.getUserById(userId),
        storage.getOrdersByUserId(userId),
      ]);
      const esimOrders = userOrders.filter(o => o.status === 'fulfilled' || o.esimStatus !== 'issued');
      const totalSpent = userOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      const activeEsims = userOrders.filter(o =>
        o.esimStatus === 'active' || o.esimStatus === 'installed' || o.esimStatus === 'issued'
      ).length;
      res.json({
        user: user ? { id: user.id, name: user.name, email: user.email } : null,
        stats: {
          totalOrders: userOrders.length,
          activeEsims,
          totalSpent: Math.round(totalSpent * 100) / 100,
          currency: 'USD',
        },
        orders: userOrders,
        esims: esimOrders,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

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

      // Auto-pricing: if pricingMode='auto' and wholesaleCost is set, compute
      // retail = wholesaleCost / (1 - targetMargin). Server controls this.
      // Per-plan targetMargin takes precedence over global targetMarginPercent setting.
      let serverPrice = plan.price;
      if (plan.pricingMode === 'auto' && plan.wholesaleCost && plan.wholesaleCost > 0) {
        let targetMargin: number;
        if (plan.targetMargin && plan.targetMargin > 0 && plan.targetMargin < 1) {
          targetMargin = plan.targetMargin; // per-plan override
        } else {
          const [marginRow] = await db.select().from(settings).where(eq(settings.key, 'targetMarginPercent'));
          targetMargin = parseFloat(marginRow?.value ?? '0.60');
        }
        if (targetMargin > 0 && targetMargin < 1) {
          // Ceiling to nearest cent to protect margin
          serverPrice = Math.ceil((plan.wholesaleCost / (1 - targetMargin)) * 100) / 100;
        }
      }

      const { url, sessionId } = await createPlanCheckoutSession({
        planId: plan.id,
        planName: plan.name,
        destination: destination?.name || 'Unknown',
        countryCode: destination?.countryCode || '',
        region: destination?.region || plan.coverage,
        dataAmount: plan.dataAmount,
        validity: plan.validity,
        dataAmountGb: plan.dataAmountGb,
        validityDays: plan.validityDays,
        price: serverPrice,   // server-controlled: auto-formula or DB price
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

  // GET /api/checkout/order-by-session/:sessionId — look up our DB order by Stripe session ID
  // Used by the success page to poll for order readiness after webhook fulfillment
  app.get("/api/checkout/order-by-session/:sessionId", async (req, res) => {
    try {
      const order = await storage.getOrderBySessionId(req.params.sessionId);
      if (!order) return res.status(404).json({ message: "Order not found yet" });
      // Sanitize: only return fields the frontend needs
      res.json({
        id: order.id,
        status: order.status,
        esimStatus: order.esimStatus,
        qrCode: order.qrCode,
        iccid: order.iccid,
        email: order.email,
        totalPrice: order.totalPrice,
        currency: order.currency,
        planId: order.planId,
        providerEsimId: order.providerEsimId,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to look up order" });
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

  app.patch("/api/plans/:id", requireAdmin, async (req, res) => {
    try {
      const updates = { ...req.body };

      // Auto-pricing: recompute retail price when pricingMode='auto' or
      // when wholesaleCost changes on an already-auto plan.
      const existing = await storage.getPlan(req.params.id);
      const effectiveMode = updates.pricingMode ?? existing?.pricingMode ?? 'manual';
      const effectiveCost = updates.wholesaleCost ?? existing?.wholesaleCost ?? 0;

      if (effectiveMode === 'auto' && effectiveCost > 0) {
        // Per-plan targetMargin override takes precedence over global setting
        const effectiveTargetMargin = updates.targetMargin ?? existing?.targetMargin ?? null;
        let targetMargin: number;
        if (effectiveTargetMargin && effectiveTargetMargin > 0 && effectiveTargetMargin < 1) {
          targetMargin = effectiveTargetMargin;
        } else {
          const [marginRow] = await db.select().from(settings).where(eq(settings.key, 'targetMarginPercent'));
          targetMargin = parseFloat(marginRow?.value ?? '0.60');
        }
        if (targetMargin > 0 && targetMargin < 1) {
          updates.price = Math.ceil((effectiveCost / (1 - targetMargin)) * 100) / 100;
        }
      }

      // Validation: manual-mode retail price must not be below provider cost
      if (effectiveMode === 'manual' && effectiveCost > 0) {
        const finalPrice = updates.price ?? existing?.price ?? 0;
        if (finalPrice > 0 && finalPrice < effectiveCost) {
          return res.status(400).json({
            message: `Retail price ($${finalPrice.toFixed(2)}) cannot be less than provider cost ($${effectiveCost.toFixed(2)}). This would result in a loss.`,
          });
        }
      }

      const updated = await storage.updatePlan(req.params.id, updates);
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

  // POST /api/internal/provider/import-plans — fetch provider plan catalog and upsert into DB
  app.post("/api/internal/provider/import-plans", requireAdmin, async (req, res) => {
    try {
      const countryCode = req.body?.countryCode as string | undefined;
      const provider = getActiveProvider();
      const providerPlans = await provider.getSupportedPlans(countryCode);
      const imported: string[] = [];

      for (const pp of providerPlans) {
        // Find destination by region or name match (best-effort)
        const destinations = await storage.getDestinations();
        const dest = destinations.find(d =>
          d.name.toLowerCase() === pp.destination.toLowerCase() ||
          d.region.toLowerCase() === pp.region.toLowerCase()
        );
        if (!dest) continue;

        // Check if plan already exists by externalPlanCode
        const existing = (await storage.getAllPlans()).find(p => p.externalPlanCode === pp.providerPlanCode);
        if (existing) {
          await storage.updatePlan(existing.id, {
            isActive: pp.isActive,
            price: pp.priceMinor / 100,
            planStatus: pp.isActive ? 'live' : 'archived',
          });
          imported.push(`updated:${pp.providerPlanCode}`);
        } else {
          const dataGb = pp.dataMb / 1024;
          await storage.createPlan({
            destinationId: dest.id,
            externalPlanCode: pp.providerPlanCode,
            name: pp.name,
            dataAmount: dataGb >= 1 ? `${dataGb} GB` : `${pp.dataMb} MB`,
            dataAmountGb: dataGb,
            validity: `${pp.durationDays} days`,
            validityDays: pp.durationDays,
            price: pp.priceMinor / 100,
            currency: pp.currency,
            coverage: pp.destination,
            features: [],
            planStatus: pp.isActive ? 'live' : 'archived',
            isActive: pp.isActive,
            provider: provider.name,
          });
          imported.push(`created:${pp.providerPlanCode}`);
        }
      }

      res.json({ ok: true, provider: provider.name, totalFromProvider: providerPlans.length, imported });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/internal/sync/run-job — scheduler-compatible single entry point
  app.post("/api/internal/sync/run-job", requireAdmin, async (_req, res) => {
    runUsageSyncJob().catch(console.error); // fire-and-forget
    res.json({ ok: true, message: "Sync job triggered" });
  });

  // GET /api/internal/lifecycle/low-data — eSIMs with <20% data remaining
  app.get("/api/internal/lifecycle/low-data", requireAdmin, async (req, res) => {
    try {
      const threshold = parseFloat(req.query.threshold as string) || 0.2;
      const result = await findEsimsLowOnData(threshold);
      res.json({ count: result.length, esims: result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/internal/lifecycle/expiring — eSIMs expiring within N days
  app.get("/api/internal/lifecycle/expiring", requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 2;
      const result = await findEsimsExpiringSoon(days);
      res.json({ count: result.length, esims: result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/internal/lifecycle/expired — eSIMs that have expired
  app.get("/api/internal/lifecycle/expired", requireAdmin, async (req, res) => {
    try {
      const result = await findExpiredEsimsNeedingRenewal();
      res.json({ count: result.length, esims: result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── ADMIN ────────────────────────────────────────────
  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
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

      // ── Profit & weighted margin (routing-aware orders only) ────────────────
      // For orders without wholesaleCostUsd, fall back to the plan's wholesaleCost
      const planCostMap = Object.fromEntries(allPlans.map(p => [p.id, p.wholesaleCost ?? 0]));

      // Only fulfilled / completed orders contribute to profit stats
      const revenueOrders = allOrders.filter(o =>
        o.status === 'fulfilled' || o.status === 'completed' || o.status === 'paid'
      );

      // Build per-order profit entries
      interface OrderProfit {
        revenue: number;
        cost: number;
        profit: number;
        provider: string;
      }
      const profitEntries: OrderProfit[] = revenueOrders.map(o => {
        const cost = o.wholesaleCostUsd ?? planCostMap[o.planId] ?? 0;
        const revenue = o.totalPrice;
        // Prefer stored profit (set at checkout time); fall back to computed
        const profit = o.profit ?? (revenue - cost);
        return {
          revenue,
          cost,
          profit,
          provider: o.selectedProviderKey ?? o.providerName ?? 'unknown',
        };
      });

      const totalProfit = profitEntries.reduce((s, e) => s + e.profit, 0);
      const revenueWithCost = profitEntries.filter(e => e.cost > 0);
      const totalRevenueWithCost = revenueWithCost.reduce((s, e) => s + e.revenue, 0);
      const weightedMargin = totalRevenueWithCost > 0
        ? (revenueWithCost.reduce((s, e) => s + e.profit, 0) / totalRevenueWithCost) * 100
        : 0;
      const avgProfitPerOrder = profitEntries.length > 0
        ? totalProfit / profitEntries.length
        : 0;

      // Simple unweighted avg margin on plans (backward compat)
      const avgMargin = allPlans.reduce((sum, p) => {
        if (p.wholesaleCost && p.price > 0) {
          return sum + calculateMargin(p.price, p.wholesaleCost);
        }
        return sum;
      }, 0) / (allPlans.filter(p => p.wholesaleCost && p.wholesaleCost > 0).length || 1);

      // ── Provider cost breakdown ─────────────────────────────────────────────
      const breakdownMap: Record<string, { orderCount: number; revenue: number; cost: number; profit: number }> = {};
      for (const e of profitEntries) {
        if (!breakdownMap[e.provider]) {
          breakdownMap[e.provider] = { orderCount: 0, revenue: 0, cost: 0, profit: 0 };
        }
        breakdownMap[e.provider].orderCount++;
        breakdownMap[e.provider].revenue += e.revenue;
        breakdownMap[e.provider].cost += e.cost;
        breakdownMap[e.provider].profit += e.profit;
      }
      const providerBreakdown = Object.entries(breakdownMap).map(([provider, d]) => ({
        provider,
        orderCount: d.orderCount,
        revenue: d.revenue,
        cost: d.cost,
        profit: d.profit,
        marginPct: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0,
      })).sort((a, b) => b.profit - a.profit);

      res.json({
        totalRevenue,
        totalOrders,
        livePlans,
        totalDestinations,
        avgMargin: Math.round(avgMargin),
        weightedMargin: Math.round(weightedMargin * 10) / 10,
        totalProfit: Math.round(totalProfit * 100) / 100,
        avgProfitPerOrder: Math.round(avgProfitPerOrder * 100) / 100,
        activeEsims: allOrders.filter(o =>
          o.esimStatus === "active" || o.esimStatus === "installed" || o.esimStatus === "issued"
        ).length,
        providerBreakdown,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // ── Settings (admin) ────────────────────────────────────────────────────────
  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(settings);
      const result: Record<string, string> = { targetMarginPercent: '0.60' }; // defaults
      for (const row of rows) result[row.key] = row.value;
      res.json(result);
    } catch {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const allowed = ['targetMarginPercent'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          const value = String(req.body[key]);
          await db.insert(settings)
            .values({ key, value })
            .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
        }
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // ── Apply auto-pricing to all auto-mode plans ──────────────────────────────
  app.post("/api/admin/settings/apply-auto-pricing", requireAdmin, async (_req, res) => {
    try {
      const [marginRow] = await db.select().from(settings).where(eq(settings.key, 'targetMarginPercent'));
      const targetMargin = parseFloat(marginRow?.value ?? '0.60');
      if (targetMargin <= 0 || targetMargin >= 1) {
        return res.status(400).json({ message: "Invalid targetMarginPercent in settings" });
      }

      const allPlans = await storage.getAllPlans();
      const autoPans = allPlans.filter(p => p.pricingMode === 'auto' && p.wholesaleCost && p.wholesaleCost > 0);

      let updated = 0;
      for (const plan of autoPans) {
        // Per-plan targetMargin takes precedence over the global setting
        const effectiveMargin = (plan.targetMargin && plan.targetMargin > 0 && plan.targetMargin < 1)
          ? plan.targetMargin
          : targetMargin;
        const newPrice = Math.ceil((plan.wholesaleCost! / (1 - effectiveMargin)) * 100) / 100;
        if (Math.abs(newPrice - plan.price) > 0.001) {
          await storage.updatePlan(plan.id, { price: newPrice });
          updated++;
        }
      }

      res.json({ success: true, updatedCount: updated, targetMargin });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to apply auto-pricing" });
    }
  });

  // ── Routing decisions (admin) ───────────────────────────────────────────────
  app.get("/api/admin/routing-decisions", requireAdmin, async (req, res) => {
    try {
      const { routingDecisions, providerOffers, providers } = await import("@shared/schema");
      const limit = parseInt(req.query.limit as string || "50", 10);
      const rows = await db
        .select()
        .from(routingDecisions)
        .orderBy(sql`${routingDecisions.createdAt} desc`)
        .limit(limit);
      res.json(rows);
    } catch (err: any) {
      console.error("/api/admin/routing-decisions error:", err.message);
      res.status(500).json({ message: "Failed to fetch routing decisions" });
    }
  });

  // ── Provider attempts for an order (admin) ──────────────────────────────────
  app.get("/api/admin/provider-attempts/:orderId", requireAdmin, async (req, res) => {
    try {
      const { providerAttempts } = await import("@shared/schema");
      const rows = await db
        .select()
        .from(providerAttempts)
        .where(eq(providerAttempts.orderId, req.params.orderId))
        .orderBy(sql`${providerAttempts.createdAt} asc`);
      res.json(rows);
    } catch (err: any) {
      console.error("/api/admin/provider-attempts error:", err.message);
      res.status(500).json({ message: "Failed to fetch provider attempts" });
    }
  });

  return httpServer;
}
