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
  pricingMode: text("pricing_mode").notNull().default("manual"), // 'manual' | 'auto'
  // Per-plan target margin override (0–1). When set, takes precedence over the
  // global targetMarginPercent setting for auto-priced plans.
  targetMargin: doublePrecision("target_margin"),
  stripePriceId: text("stripe_price_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── ORDERS ──────────────────────────────────────────
// status: pending | paid | failed | fulfilling | fulfilled | fulfillment_failed | partially_fulfilled | refunded | rejected_below_floor
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").references(() => plans.id),
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
  // Routing & pricing fields (populated at checkout time by routing engine)
  normalizedPlanId: varchar("normalized_plan_id"),
  routingDecisionId: varchar("routing_decision_id"),
  selectedProviderKey: text("selected_provider_key"),
  fallbackProvidersJson: jsonb("fallback_providers_json"),
  wholesaleCostUsd: doublePrecision("wholesale_cost_usd"),
  marginPercent: doublePrecision("margin_percent"),
  // Stored profit at time of fulfillment (totalPrice − wholesaleCostUsd).
  // Computed and saved once at checkout/fulfillment so analytics never need
  // to re-derive it from volatile plan data.
  profit: doublePrecision("profit"),
  // PayPal fields
  paypalOrderId: text("paypal_order_id"),
  paypalCaptureId: text("paypal_capture_id"),
  // Paddle fields
  paddleTransactionId: text("paddle_transaction_id"),
  // eSIM connectivity
  apn: text("apn"),
});

// ─── PROVIDER SYNC RUNS ───────────────────────────────
// One row per catalogue sync run (fetching live plans from providers).
// Distinct from providerSyncLogs which tracks per-eSIM usage sync events.
export const providerSyncRuns = pgTable("provider_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  triggeredBy: text("triggered_by").notNull().default("auto"), // "auto" | "manual"
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("running"), // running | success | partial | failed
  providersAttempted: integer("providers_attempted").notNull().default(0),
  providersSucceeded: integer("providers_succeeded").notNull().default(0),
  failedProviders: jsonb("failed_providers").$type<string[]>(),
  offersUpserted: integer("offers_upserted").notNull().default(0),
  plansUpdated: integer("plans_updated").notNull().default(0),
  priceChanges: integer("price_changes").notNull().default(0),
  errorMessage: text("error_message"),
});

// ─── SETTINGS ─────────────────────────────────────────
// Global key-value store for admin-configurable settings.
// Known keys: targetMarginPercent (decimal 0-1, default 0.60)
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── PROVIDER ATTEMPTS ────────────────────────────────
// Logs every provider provisioning attempt during fulfillment.
// status: ok | error | skipped
export const providerAttempts = pgTable("provider_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  providerKey: text("provider_key").notNull(),
  providerPlanCode: text("provider_plan_code"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  status: text("status").notNull().default("pending"), // ok | error | skipped
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow(),
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
  // Auto-pause — system-managed, separate from manual enabled/disabled.
  // autoPaused=true excludes the provider from routing until manually cleared.
  autoPaused: boolean("auto_paused").notNull().default(false),
  autoPauseReason: text("auto_pause_reason"),    // human-readable trigger description
  autoPausedAt: timestamp("auto_paused_at"),     // when the system paused it
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
}, (t) => ({
  uniqPlan: uniqueIndex("normalized_plans_region_data_validity_uniq").on(t.regionCode, t.dataMb, t.validityDays),
}));

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
  coverageType: text("coverage_type").notNull().default("country"), // country | regional | global
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniqOffer: uniqueIndex("provider_offers_plan_provider_code_uniq").on(t.normalizedPlanId, t.providerKey, t.providerPlanCode),
}));

// ─── DESTINATION PROVIDER STATS ──────────────────────
// Rolling performance memory per (provider, destination) pair.
// Updated after every fulfilment attempt — success, failure, or fallback.
// Uses exponential moving averages to prioritise recent outcomes.
export const destinationProviderStats = pgTable("destination_provider_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerKey: text("provider_key").notNull(),
  destination: text("destination").notNull(),           // ISO country code (uppercase)
  recentOrdersCount: integer("recent_orders_count").notNull().default(0),
  fulfilmentSuccessRate: doublePrecision("fulfilment_success_rate").notNull().default(1.0), // 0.0–1.0
  avgLatencyMs: integer("avg_latency_ms"),
  avgMarginPercent: doublePrecision("avg_margin_percent"),
  failoverRate: doublePrecision("failover_rate").notNull().default(0.0), // 0.0–1.0: how often used as non-primary
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("destination_provider_stats_uniq").on(t.providerKey, t.destination),
}));

// ─── ROUTING DECISIONS ───────────────────────────────
// Persists every routing engine decision for auditability and analytics.
// strategy: cheapest_cost | highest_margin | best_health | blended_score
// fallback_chain: JSON array of RankedProvider objects (all candidates ranked)
// scores: JSON object keyed by providerKey → ProviderScores
export const routingDecisions = pgTable("routing_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  normalizedPlanId: varchar("normalized_plan_id").notNull().references(() => normalizedPlans.id),
  strategy: text("strategy").notNull().default("blended_score"),
  selectedProviderKey: text("selected_provider_key").notNull(),
  selectedProviderPlanCode: text("selected_provider_plan_code").notNull(),
  fallbackChain: jsonb("fallback_chain").notNull(),     // RankedProvider[]
  scores: jsonb("scores").notNull(),                    // Record<providerKey, ProviderScores>
  decisionReason: text("decision_reason").notNull(),
  retailPriceUsdSnapshot: doublePrecision("retail_price_usd_snapshot"),
  confidenceScore: integer("confidence_score"),         // 0–100; null for legacy rows
  confidenceLabel: text("confidence_label"),            // "high" | "medium" | "low"
  createdAt: timestamp("created_at").defaultNow(),
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
export const insertRoutingDecisionSchema = createInsertSchema(routingDecisions).omit({ id: true, createdAt: true });
export const insertProviderAttemptSchema = createInsertSchema(providerAttempts).omit({ id: true, createdAt: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ updatedAt: true });
export const insertDestinationProviderStatsSchema = createInsertSchema(destinationProviderStats).omit({ id: true, updatedAt: true });

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
export type ProviderSyncRun = typeof providerSyncRuns.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type NormalizedPlan = typeof normalizedPlans.$inferSelect;
export type InsertNormalizedPlan = z.infer<typeof insertNormalizedPlanSchema>;
export type ProviderOffer = typeof providerOffers.$inferSelect;
export type InsertProviderOffer = z.infer<typeof insertProviderOfferSchema>;
export type RoutingDecision = typeof routingDecisions.$inferSelect;
export type InsertRoutingDecision = z.infer<typeof insertRoutingDecisionSchema>;
export type ProviderAttempt = typeof providerAttempts.$inferSelect;
export type InsertProviderAttempt = z.infer<typeof insertProviderAttemptSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingsSchema>;
export type DestinationProviderStats = typeof destinationProviderStats.$inferSelect;
export type InsertDestinationProviderStats = z.infer<typeof insertDestinationProviderStatsSchema>;
