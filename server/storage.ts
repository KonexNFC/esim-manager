import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  destinations, plans, orders,
  type Destination, type InsertDestination,
  type Plan, type InsertPlan,
  type Order, type InsertOrder,
} from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export interface IStorage {
  getDestinations(): Promise<Destination[]>;
  getPopularDestinations(): Promise<Destination[]>;
  getDestination(id: string): Promise<Destination | undefined>;
  createDestination(dest: InsertDestination): Promise<Destination>;

  getAllPlans(): Promise<Plan[]>;
  getPlans(destinationId: string): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<InsertPlan & { planStatus: string }>): Promise<Plan | undefined>;

  getAllOrders(): Promise<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string })[]>;
  getOrdersByEmail(email: string): Promise<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string })[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<{ status: string; esimStatus: string }>): Promise<Order | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getDestinations(): Promise<Destination[]> {
    return db.select().from(destinations);
  }

  async getPopularDestinations(): Promise<Destination[]> {
    return db.select().from(destinations).where(eq(destinations.popular, true));
  }

  async getDestination(id: string): Promise<Destination | undefined> {
    const [dest] = await db.select().from(destinations).where(eq(destinations.id, id));
    return dest;
  }

  async createDestination(dest: InsertDestination): Promise<Destination> {
    const [created] = await db.insert(destinations).values(dest).returning();
    return created;
  }

  async getPlans(destinationId: string): Promise<Plan[]> {
    return db.select().from(plans).where(eq(plans.destinationId, destinationId));
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async getAllPlans(): Promise<Plan[]> {
    return db.select().from(plans);
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const [created] = await db.insert(plans).values(plan).returning();
    return created;
  }

  async updatePlan(id: string, updates: Partial<InsertPlan & { planStatus: string }>): Promise<Plan | undefined> {
    const [updated] = await db.update(plans).set(updates).where(eq(plans.id, id)).returning();
    return updated;
  }

  async getAllOrders() {
    const result = await db
      .select({
        id: orders.id,
        planId: orders.planId,
        email: orders.email,
        status: orders.status,
        totalPrice: orders.totalPrice,
        currency: orders.currency,
        createdAt: orders.createdAt,
        qrCode: orders.qrCode,
        iccid: orders.iccid,
        activationDate: orders.activationDate,
        esimStatus: orders.esimStatus,
        planName: plans.name,
        dataAmount: plans.dataAmount,
        validity: plans.validity,
        destinationName: destinations.name,
        flagEmoji: destinations.flagEmoji,
      })
      .from(orders)
      .leftJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(destinations, eq(plans.destinationId, destinations.id));

    return result.map(r => ({
      ...r,
      planName: r.planName ?? undefined,
      dataAmount: r.dataAmount ?? undefined,
      validity: r.validity ?? undefined,
      destinationName: r.destinationName ?? undefined,
      flagEmoji: r.flagEmoji ?? undefined,
    }));
  }

  async getOrdersByEmail(email: string) {
    const result = await db
      .select({
        id: orders.id,
        planId: orders.planId,
        email: orders.email,
        status: orders.status,
        totalPrice: orders.totalPrice,
        currency: orders.currency,
        createdAt: orders.createdAt,
        qrCode: orders.qrCode,
        iccid: orders.iccid,
        activationDate: orders.activationDate,
        esimStatus: orders.esimStatus,
        planName: plans.name,
        dataAmount: plans.dataAmount,
        validity: plans.validity,
        destinationName: destinations.name,
        flagEmoji: destinations.flagEmoji,
      })
      .from(orders)
      .leftJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(destinations, eq(plans.destinationId, destinations.id))
      .where(eq(orders.email, email));

    return result.map(r => ({
      ...r,
      planName: r.planName ?? undefined,
      dataAmount: r.dataAmount ?? undefined,
      validity: r.validity ?? undefined,
      destinationName: r.destinationName ?? undefined,
      flagEmoji: r.flagEmoji ?? undefined,
    }));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const iccid = `89${Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join("")}`;
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=LPA:1$esim.globesim.com$${iccid}`;

    const [created] = await db.insert(orders).values({
      ...order,
      qrCode,
      iccid,
      status: "completed",
    }).returning();
    return created;
  }

  async updateOrder(id: string, updates: Partial<{ status: string; esimStatus: string }>): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
