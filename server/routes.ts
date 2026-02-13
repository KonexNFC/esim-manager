import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema } from "@shared/schema";

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
      if (!destinationId) return res.status(400).json({ message: "destinationId required" });
      const result = await storage.getPlans(destinationId);
      res.json(result);
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

  app.get("/api/orders", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ message: "email required" });
      const result = await storage.getOrdersByEmail(email);
      res.json(result);
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
      const order = await storage.createOrder(parsed.data);
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  return httpServer;
}
