import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema, insertPlanSchema } from "@shared/schema";
import { fetchProviderPlans, getBestPlan } from "./providers";
import { purchaseEsim as providerPurchase, getAvailableProviders } from "./providers/providerManager";
import { z } from "zod";

const bestPlanSchema = z.object({
  countryCode: z.string().min(2).max(3),
  dataAmountGb: z.number().positive(),
  validityDays: z.number().int().positive(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

      const order = await storage.createOrder(parsed.data, providerResult.iccid, providerResult.qrCodeUrl);
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

  app.get("/api/admin/stats", async (req, res) => {
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
        activeEsims: allOrders.filter(o => o.esimStatus === "active" || o.esimStatus === "installed" || o.esimStatus === "issued").length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/providers/available", async (_req, res) => {
    try {
      res.json({ providers: getAvailableProviders() });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch providers" });
    }
  });

  return httpServer;
}
