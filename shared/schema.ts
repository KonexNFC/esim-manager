import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── USERS ────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── DESTINATIONS ────────────────────────────────────
export const destinations = pgTable("destinations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  countryCode: text("country_code").notNull(),
  region: text("region").notNull(),
  imageUrl: text("image_url").notNull(),
  flagEmoji: text("flag_emoji").notNull(),
  popular: boolean("popular").default(false),
  corridor: text("corridor"),
});

// ─── PLANS ───────────────────────────────────────────
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  destinationId: varchar("destination_id").notNull().references(() => destinations.id),
  name: text("name").notNull(),
  dataAmount: text("data_amount").notNull(),
  dataAmountGb: doublePrecision("data_amount_gb").notNull(),
  validity: text("validity").notNull(),
  validityDays: integer("validity_days").notNull(),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  speedInfo: text("speed_info"),
  coverage: text("coverage").notNull(),
  features: text("features").array().notNull().default(sql`'{}'::text[]`),
  popular: boolean("popular").default(false),
  planStatus: text("plan_status").notNull().default("live"),
  wholesaleCost: doublePrecision("wholesale_cost").default(0),
  provider: text("provider").notNull().default("manual"),
  stripePriceId: text("stripe_price_id"),
});

// ─── ORDERS ──────────────────────────────────────────
// status: pending | paid | failed | fulfilled | refunded
// esimStatus: issued | installed | active | expired | cancelled
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => plans.id),
  userId: varchar("user_id").references(() => users.id),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  totalPrice: doublePrecision("total_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
  qrCode: text("qr_code"),
  iccid: text("iccid"),
  activationDate: timestamp("activation_date"),
  esimStatus: text("esim_status").notNull().default("issued"),
  // Stripe fields
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCustomerId: text("stripe_customer_id"),
  purchaseType: text("purchase_type").notNull().default("initial_purchase"), // initial_purchase | topup
  // Provider fields
  providerName: text("provider_name").default("mock"),
  providerEsimId: text("provider_esim_id"),
  providerReference: text("provider_reference"),
  // eSIM data tracking
  dataTotalMb: integer("data_total_mb"),
  dataUsedMb: integer("data_used_mb").default(0),
  dataRemainingMb: integer("data_remaining_mb"),
  daysRemaining: integer("days_remaining"),
  expiresAt: timestamp("expires_at"),
  lastSyncedAt: timestamp("last_synced_at"),
});

// ─── TOPUPS ──────────────────────────────────────────
export const topups = pgTable("topups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  providerTopupId: text("provider_topup_id"),
  optionCode: text("option_code"),
  name: text("name").notNull(),
  dataAddedMb: integer("data_added_mb"),
  validityAddedDays: integer("validity_added_days"),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("pending"), // pending | completed | failed
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── PAYMENT EVENTS (idempotency log) ───────────────
export const paymentEvents = pgTable("payment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull().default("stripe"),
  externalEventId: text("external_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at"),
  payloadJson: jsonb("payload_json"),
  status: text("status").notNull().default("pending"), // pending | processed | failed | skipped
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── PROVIDER SYNC LOGS ──────────────────────────────
export const providerSyncLogs = pgTable("provider_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id),
  syncType: text("sync_type").notNull(), // usage | status | topup
  providerName: text("provider_name").notNull(),
  requestSummary: text("request_summary"),
  responseSummary: text("response_summary"),
  status: text("status").notNull().default("ok"), // ok | error
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── GIFT ORDERS ─────────────────────────────────────
export const giftOrders = pgTable("gift_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  senderUserId: varchar("sender_user_id").references(() => users.id),
  senderEmail: text("sender_email").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  message: text("message"),
  status: text("status").notNull().default("pending"), // pending | sent | claimed
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── INSERT SCHEMAS ───────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertDestinationSchema = createInsertSchema(destinations).omit({ id: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, qrCode: true, iccid: true, activationDate: true, lastSyncedAt: true });
export const insertTopupSchema = createInsertSchema(topups).omit({ id: true, createdAt: true });
export const insertGiftOrderSchema = createInsertSchema(giftOrders).omit({ id: true, createdAt: true, claimedAt: true });

// ─── TYPES ────────────────────────────────────────────
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDestination = z.infer<typeof insertDestinationSchema>;
export type Destination = typeof destinations.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertTopup = z.infer<typeof insertTopupSchema>;
export type Topup = typeof topups.$inferSelect;
export type GiftOrder = typeof giftOrders.$inferSelect;
export type InsertGiftOrder = typeof giftOrders.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type ProviderSyncLog = typeof providerSyncLogs.$inferSelect;
