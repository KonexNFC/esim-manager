import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, doublePrecision, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── USERS ────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  authProvider: text("auth_provider").default("email"),
  stripeCustomerId: text("stripe_customer_id"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  externalPlanCode: text("external_plan_code"),
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
  isActive: boolean("is_active").notNull().default(true),
  wholesaleCost: doublePrecision("wholesale_cost").default(0),
  provider: text("provider").notNull().default("manual"),
  stripePriceId: text("stripe_price_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── ORDERS ──────────────────────────────────────────
// status: pending | paid | failed | fulfilling | fulfilled | fulfillment_failed | partially_fulfilled | refunded
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => plans.id),
  userId: varchar("user_id").references(() => users.id),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  totalPrice: doublePrecision("total_price").notNull(),
  subtotalMinor: integer("subtotal_minor"),
  totalMinor: integer("total_minor"),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  qrCode: text("qr_code"),
  iccid: text("iccid"),
  activationDate: timestamp("activation_date"),
  esimStatus: text("esim_status").notNull().default("issued"),
  // Stripe fields
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCustomerId: text("stripe_customer_id"),
  purchaseType: text("purchase_type").notNull().default("initial_purchase"),
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

// ─── ORDER ITEMS ──────────────────────────────────────
// Line items within an order (supports bundles, topups, plan add-ons)
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  itemType: text("item_type").notNull().default("plan"), // plan | topup | bundle
  planId: varchar("plan_id").references(() => plans.id),
  name: text("name").notNull(),
  destination: text("destination"),
  region: text("region"),
  dataMb: integer("data_mb"),
  durationDays: integer("duration_days"),
  unitAmountMinor: integer("unit_amount_minor").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── ESIMS ───────────────────────────────────────────
// Standalone eSIM entity — created during fulfillment, tracks lifecycle
// activation_status: issued | installed | active | expired | cancelled
export const esims = pgTable("esims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id),
  planId: varchar("plan_id").references(() => plans.id),
  providerName: text("provider_name").notNull().default("mock"),
  providerEsimId: text("provider_esim_id"),
  providerIccid: text("provider_iccid"),
  providerReference: text("provider_reference"),
  qrCodeUrl: text("qr_code_url"),
  manualCode: text("manual_code"),
  destination: text("destination").notNull().default(""),
  region: text("region").notNull().default(""),
  planName: text("plan_name").notNull().default(""),
  activationStatus: text("activation_status").notNull().default("issued"),
  dataTotalMb: integer("data_total_mb"),
  dataUsedMb: integer("data_used_mb").default(0),
  dataRemainingMb: integer("data_remaining_mb"),
  validityDays: integer("validity_days"),
  daysRemaining: integer("days_remaining"),
  activatedAt: timestamp("activated_at"),
  expiresAt: timestamp("expires_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── TOPUPS ──────────────────────────────────────────
export const topups = pgTable("topups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  esimId: varchar("esim_id").references(() => esims.id),
  providerTopupId: text("provider_topup_id"),
  optionCode: text("option_code"),
  name: text("name").notNull(),
  dataAddedMb: integer("data_added_mb"),
  validityAddedDays: integer("validity_added_days"),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("pending"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── PAYMENT EVENTS (idempotency log) ───────────────
export const paymentEvents = pgTable("payment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull().default("stripe"),
  externalEventId: text("external_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at"),
  payloadJson: jsonb("payload_json"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── PROVIDER SYNC LOGS ──────────────────────────────
export const providerSyncLogs = pgTable("provider_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id),
  esimId: varchar("esim_id").references(() => esims.id),
  syncType: text("sync_type").notNull(),
  providerName: text("provider_name").notNull(),
  requestSummary: text("request_summary"),
  responseSummary: text("response_summary"),
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── NOTIFICATIONS ───────────────────────────────────
// type: purchase_confirmation | esim_ready | low_data | expiry_reminder | topup_confirmation | payment_failed
// channel: email | sms | push
// status: pending | sent | failed
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  esimId: varchar("esim_id").references(() => esims.id),
  type: text("type").notNull(),
  channel: text("channel").notNull().default("email"),
  status: text("status").notNull().default("pending"),
  payloadJson: jsonb("payload_json"),
  sentAt: timestamp("sent_at"),
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
  status: text("status").notNull().default("pending"),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── PROVIDERS (registry) ────────────────────────────
// health_status: healthy | degraded | down | unknown
export const providers = pgTable("providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),           // e.g. "esimgo", "esimAccess", "zendit"
  name: text("name").notNull(),                  // display name
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(10), // lower = higher priority
  healthStatus: text("health_status").notNull().default("unknown"),
  lastHealthCheck: timestamp("last_health_check"),
  metadata: jsonb("metadata"),                   // arbitrary config / notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── NORMALIZED PLANS ────────────────────────────────
// Provider-agnostic plan definitions shown to customers.
// plan_type: data | unlimited | daypass
export const normalizedPlans = pgTable("normalized_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  destinationId: varchar("destination_id").references(() => destinations.id),
  regionCode: text("region_code").notNull(),      // ISO country code or "GLOBAL" / region slug
  name: text("name").notNull(),                   // e.g. "United Kingdom 1 GB / 7 Days"
  dataMb: integer("data_mb").notNull(),           // 999999 = unlimited
  validityDays: integer("validity_days").notNull(),
  isUnlimited: boolean("is_unlimited").notNull().default(false),
  planType: text("plan_type").notNull().default("data"), // data | unlimited | daypass
  retailPriceUsd: doublePrecision("retail_price_usd").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── PROVIDER OFFERS ─────────────────────────────────
// Maps each normalizedPlan to one or more provider-specific bundles.
// The routing system picks the best offer at purchase time.
export const providerOffers = pgTable("provider_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  normalizedPlanId: varchar("normalized_plan_id").notNull().references(() => normalizedPlans.id),
  providerKey: text("provider_key").notNull(),    // FK to providers.key (denormalised for speed)
  providerPlanCode: text("provider_plan_code").notNull(), // provider-specific bundle code
  wholesalePriceUsd: doublePrecision("wholesale_price_usd").notNull(),
  currency: text("currency").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── INSERT SCHEMAS ───────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDestinationSchema = createInsertSchema(destinations).omit({ id: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, updatedAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true, qrCode: true, iccid: true, activationDate: true, lastSyncedAt: true });
export const insertTopupSchema = createInsertSchema(topups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEsimSchema = createInsertSchema(esims).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertGiftOrderSchema = createInsertSchema(giftOrders).omit({ id: true, createdAt: true, claimedAt: true });
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNormalizedPlanSchema = createInsertSchema(normalizedPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProviderOfferSchema = createInsertSchema(providerOffers).omit({ id: true, createdAt: true, updatedAt: true });

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
export type InsertEsim = z.infer<typeof insertEsimSchema>;
export type Esim = typeof esims.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type GiftOrder = typeof giftOrders.$inferSelect;
export type InsertGiftOrder = typeof giftOrders.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type ProviderSyncLog = typeof providerSyncLogs.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type NormalizedPlan = typeof normalizedPlans.$inferSelect;
export type InsertNormalizedPlan = z.infer<typeof insertNormalizedPlanSchema>;
export type ProviderOffer = typeof providerOffers.$inferSelect;
export type InsertProviderOffer = z.infer<typeof insertProviderOfferSchema>;
