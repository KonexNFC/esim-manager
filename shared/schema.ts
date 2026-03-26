import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertDestinationSchema = createInsertSchema(destinations).omit({ id: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, qrCode: true, iccid: true, activationDate: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDestination = z.infer<typeof insertDestinationSchema>;
export type Destination = typeof destinations.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
