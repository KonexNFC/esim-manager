import { eq, and, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users, destinations, plans, orders, topups, paymentEvents, providerSyncLogs,
  type User, type InsertUser,
  type Destination, type InsertDestination,
  type Plan, type InsertPlan,
  type Order, type InsertOrder,
  type Topup, type InsertTopup,
  type PaymentEvent, type ProviderSyncLog,
} from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export interface IStorage {
  // Users
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<{ name: string; passwordHash: string; stripeCustomerId: string }>): Promise<User | undefined>;
  linkOrdersToUser(email: string, userId: string): Promise<void>;

  // Destinations
  getDestinations(): Promise<Destination[]>;
  getPopularDestinations(): Promise<Destination[]>;
  getDestination(id: string): Promise<Destination | undefined>;
  createDestination(dest: InsertDestination): Promise<Destination>;

  // Plans
  getAllPlans(): Promise<Plan[]>;
  getPlans(destinationId: string): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<InsertPlan & { planStatus: string }>): Promise<Plan | undefined>;

  // Orders
  getAllOrders(): Promise<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string; dataAmountGb?: number; validityDays?: number })[]>;
  getOrdersByEmail(email: string): Promise<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string; dataAmountGb?: number; validityDays?: number })[]>;
  getOrdersByUserId(userId: string): Promise<(Order & { planName?: string; destinationName?: string; flagEmoji?: string; dataAmount?: string; validity?: string; dataAmountGb?: number; validityDays?: number })[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder, providerIccid?: string, providerQrCode?: string): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;

  // Topups
  getTopupsByOrderId(orderId: string): Promise<Topup[]>;
  createTopup(topup: InsertTopup): Promise<Topup>;
  updateTopup(id: string, updates: Partial<Topup>): Promise<Topup | undefined>;

  // Payment events (idempotency)
  getPaymentEvent(externalEventId: string): Promise<PaymentEvent | undefined>;
  createPaymentEvent(event: Partial<PaymentEvent>): Promise<PaymentEvent>;
  markPaymentEventProcessed(externalEventId: string): Promise<void>;
}

// ─── Order join helpers ───────────────────────────────
const orderSelectFields = (_db: any) => ({
  id: orders.id,
  planId: orders.planId,
  userId: orders.userId,
  email: orders.email,
  status: orders.status,
  totalPrice: orders.totalPrice,
  currency: orders.currency,
  createdAt: orders.createdAt,
  qrCode: orders.qrCode,
  iccid: orders.iccid,
  activationDate: orders.activationDate,
  esimStatus: orders.esimStatus,
  stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
  stripePaymentIntentId: orders.stripePaymentIntentId,
  stripeCustomerId: orders.stripeCustomerId,
  purchaseType: orders.purchaseType,
  providerName: orders.providerName,
  providerEsimId: orders.providerEsimId,
  providerReference: orders.providerReference,
  dataTotalMb: orders.dataTotalMb,
  dataUsedMb: orders.dataUsedMb,
  dataRemainingMb: orders.dataRemainingMb,
  daysRemaining: orders.daysRemaining,
  expiresAt: orders.expiresAt,
  lastSyncedAt: orders.lastSyncedAt,
  planName: plans.name,
  dataAmount: plans.dataAmount,
  dataAmountGb: plans.dataAmountGb,
  validity: plans.validity,
  validityDays: plans.validityDays,
  destinationName: destinations.name,
  flagEmoji: destinations.flagEmoji,
});

function mapOrderRow(r: any) {
  return {
    ...r,
    planName: r.planName ?? undefined,
    dataAmount: r.dataAmount ?? undefined,
    dataAmountGb: r.dataAmountGb ?? undefined,
    validity: r.validity ?? undefined,
    validityDays: r.validityDays ?? undefined,
    destinationName: r.destinationName ?? undefined,
    flagEmoji: r.flagEmoji ?? undefined,
  };
}

export class DatabaseStorage implements IStorage {
  // ─── Users ────────────────────────────────────────
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, updates: Partial<{ name: string; passwordHash: string; stripeCustomerId: string }>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  async linkOrdersToUser(email: string, userId: string): Promise<void> {
    await db.update(orders).set({ userId }).where(and(eq(orders.email, email), eq(orders.userId, null as any)));
  }

  // ─── Destinations ─────────────────────────────────
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

  // ─── Plans ────────────────────────────────────────
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

  // ─── Orders ───────────────────────────────────────
  async getAllOrders() {
    const result = await db
      .select(orderSelectFields(db))
      .from(orders)
      .leftJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(destinations, eq(plans.destinationId, destinations.id));
    return result.map(mapOrderRow);
  }

  async getOrdersByEmail(email: string) {
    const result = await db
      .select(orderSelectFields(db))
      .from(orders)
      .leftJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(destinations, eq(plans.destinationId, destinations.id))
      .where(eq(orders.email, email));
    return result.map(mapOrderRow);
  }

  async getOrdersByUserId(userId: string) {
    const result = await db
      .select(orderSelectFields(db))
      .from(orders)
      .leftJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(destinations, eq(plans.destinationId, destinations.id))
      .where(eq(orders.userId, userId));
    return result.map(mapOrderRow);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async createOrder(order: InsertOrder, providerIccid?: string, providerQrCode?: string): Promise<Order> {
    const iccid = providerIccid || `89${Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join("")}`;
    const qrCode = providerQrCode || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=LPA:1$esim.globesim.com$${iccid}`;

    const [created] = await db.insert(orders).values({
      ...order,
      qrCode,
      iccid,
      status: "completed",
    }).returning();
    return created;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();
    return updated;
  }

  // ─── Topups ───────────────────────────────────────
  async getTopupsByOrderId(orderId: string): Promise<Topup[]> {
    return db.select().from(topups).where(eq(topups.orderId, orderId));
  }

  async createTopup(topup: InsertTopup): Promise<Topup> {
    const [created] = await db.insert(topups).values(topup).returning();
    return created;
  }

  async updateTopup(id: string, updates: Partial<Topup>): Promise<Topup | undefined> {
    const [updated] = await db.update(topups).set(updates).where(eq(topups.id, id)).returning();
    return updated;
  }

  // ─── Payment Events ───────────────────────────────
  async getPaymentEvent(externalEventId: string): Promise<PaymentEvent | undefined> {
    const [event] = await db.select().from(paymentEvents).where(eq(paymentEvents.externalEventId, externalEventId));
    return event;
  }

  async createPaymentEvent(event: Partial<PaymentEvent>): Promise<PaymentEvent> {
    const [created] = await db.insert(paymentEvents).values({
      provider: event.provider || 'stripe',
      externalEventId: event.externalEventId!,
      eventType: event.eventType!,
      payloadJson: event.payloadJson,
      status: 'pending',
    }).returning();
    return created;
  }

  async markPaymentEventProcessed(externalEventId: string): Promise<void> {
    await db.update(paymentEvents)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(paymentEvents.externalEventId, externalEventId));
  }
}

export const storage = new DatabaseStorage();
