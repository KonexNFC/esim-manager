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

  getPlans(destinationId: string): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;

  getOrdersByEmail(email: string): Promise<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string })[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
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

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const [created] = await db.insert(plans).values(plan).returning();
    return created;
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
}

export const storage = new DatabaseStorage();
