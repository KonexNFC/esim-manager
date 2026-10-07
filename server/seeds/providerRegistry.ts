// ─── Provider Registry Seed ───────────────────────────────────────────────────
// Idempotent seed for provider definitions and normalized product definitions.
// Supplier offers are live sync data and are never fabricated by this seed.

import { createNormalizedPlan } from "../services/providerRegistry";
import { db } from "../storage";
import { normalizedPlans, providers } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ─── 1. Provider Registry ────────────────────────────────────────────────────

const PROVIDERS = [
  {
    key: "airalo",
    name: "Airalo",
    enabled: true,
    priority: 1,
    healthStatus: "unknown" as const,
    metadata: { apiVersion: "v2", notes: "Live catalogue provider — credentials required" },
  },
  {
    key: "esimgo",
    name: "eSIMGo",
    enabled: true,
    priority: 3,
    healthStatus: "unknown" as const,
    metadata: { apiVersion: "v2.5", baseUrl: "https://api.esim-go.com/v2.5", notes: "Primary provider — HMAC auth via X-API-Key" },
  },
  {
    key: "esimaccess",
    name: "eSIM Access",
    enabled: true,
    priority: 2,
    healthStatus: "unknown" as const,
    metadata: { apiVersion: "v1", baseUrl: "https://api.esimaccess.com/api/v1/open", notes: "Fallback provider — HMAC-SHA256 signed requests" },
  },
  {
    key: "zendit",
    name: "Zendit",
    enabled: false,      // Disabled until API key is provided
    priority: 4,
    healthStatus: "unknown" as const,
    metadata: { apiVersion: "v1", baseUrl: "https://api.zendit.io/v1", notes: "Disabled — requires ZENDIT_API_KEY" },
  },
  {
    key: "mock",
    name: "Mock (Dev)",
    enabled: false,      // Never used in production routing
    priority: 99,
    healthStatus: "healthy" as const,
    metadata: { notes: "In-memory mock for development and tests only" },
  },
];

// ─── 2. Normalized Plan definitions ─────────────────────────────────────────
// Format: { regionCode, destinationId, name, dataMb, validityDays, isUnlimited, planType, retailPriceUsd }
// dataMb = 999999 for unlimited plans

type PlanDef = {
  regionCode: string;
  destinationId: string;
  name: string;
  dataMb: number;
  validityDays: number;
  isUnlimited: boolean;
  planType: "data" | "unlimited" | "daypass";
  retailPriceUsd: number;
};

// Destination IDs from the database
const DEST = {
  GB: "d9565d23-e21b-4fe6-a025-16fd17400d26", // United Kingdom
  US: "73b8df20-9af5-46eb-b825-648fdda35c10", // United States
  FR: "d252cf14-182e-4b03-b84f-046f45037696", // France
  TH: "641f6294-84fc-4e3d-be9d-b361f6f2fe55", // Thailand
  AE: "095bb44d-0f7e-4f5b-93c7-dcaaf2a7ce5b", // UAE
  JP: "17957022-fc09-423e-be99-2ab84549eb73", // Japan
  NG: "440108e3-a1a3-4baf-8802-b7101be6037e", // Nigeria
  ZA: "09e25b0f-714c-4c30-8e55-ce1049caaa50", // South Africa
  KE: "5dca6877-6fef-428c-8b4f-92e491d3bf37", // Kenya
};

const PLAN_DEFS: PlanDef[] = [
  // ── United Kingdom ──
  { regionCode: "GB", destinationId: DEST.GB, name: "UK 1 GB / 7 Days",       dataMb: 1024,   validityDays: 7,  isUnlimited: false, planType: "data",      retailPriceUsd: 5.49  },
  { regionCode: "GB", destinationId: DEST.GB, name: "UK 3 GB / 30 Days",      dataMb: 3072,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 9.99  },
  { regionCode: "GB", destinationId: DEST.GB, name: "UK 5 GB / 30 Days",      dataMb: 5120,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 14.99 },
  { regionCode: "GB", destinationId: DEST.GB, name: "UK 10 GB / 30 Days",     dataMb: 10240,  validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 22.99 },
  { regionCode: "GB", destinationId: DEST.GB, name: "UK Unlimited / 1 Day",   dataMb: 999999, validityDays: 1,  isUnlimited: true,  planType: "unlimited", retailPriceUsd: 3.99  },
  { regionCode: "GB", destinationId: DEST.GB, name: "UK Unlimited / 7 Days",  dataMb: 999999, validityDays: 7,  isUnlimited: true,  planType: "unlimited", retailPriceUsd: 18.99 },
  // ── United States ──
  { regionCode: "US", destinationId: DEST.US, name: "USA 3 GB / 15 Days",     dataMb: 3072,   validityDays: 15, isUnlimited: false, planType: "data",      retailPriceUsd: 8.99  },
  { regionCode: "US", destinationId: DEST.US, name: "USA 5 GB / 30 Days",     dataMb: 5120,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 12.99 },
  { regionCode: "US", destinationId: DEST.US, name: "USA 10 GB / 30 Days",    dataMb: 10240,  validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 19.99 },
  // ── France ──
  { regionCode: "FR", destinationId: DEST.FR, name: "France 1 GB / 7 Days",   dataMb: 1024,   validityDays: 7,  isUnlimited: false, planType: "data",      retailPriceUsd: 5.99  },
  { regionCode: "FR", destinationId: DEST.FR, name: "France 3 GB / 30 Days",  dataMb: 3072,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 10.99 },
  { regionCode: "FR", destinationId: DEST.FR, name: "France 5 GB / 30 Days",  dataMb: 5120,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 15.99 },
  // ── Thailand ──
  { regionCode: "TH", destinationId: DEST.TH, name: "Thailand 3 GB / 15 Days",dataMb: 3072,   validityDays: 15, isUnlimited: false, planType: "data",      retailPriceUsd: 7.99  },
  { regionCode: "TH", destinationId: DEST.TH, name: "Thailand 5 GB / 30 Days",dataMb: 5120,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 11.99 },
  // ── UAE ──
  { regionCode: "AE", destinationId: DEST.AE, name: "UAE 2 GB / 15 Days",     dataMb: 2048,   validityDays: 15, isUnlimited: false, planType: "data",      retailPriceUsd: 9.99  },
  { regionCode: "AE", destinationId: DEST.AE, name: "UAE 5 GB / 30 Days",     dataMb: 5120,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 16.99 },
  // ── Japan ──
  { regionCode: "JP", destinationId: DEST.JP, name: "Japan 3 GB / 15 Days",   dataMb: 3072,   validityDays: 15, isUnlimited: false, planType: "data",      retailPriceUsd: 10.99 },
  { regionCode: "JP", destinationId: DEST.JP, name: "Japan 5 GB / 30 Days",   dataMb: 5120,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 15.99 },
  // ── Nigeria ──
  { regionCode: "NG", destinationId: DEST.NG, name: "Nigeria 1 GB / 7 Days",  dataMb: 1024,   validityDays: 7,  isUnlimited: false, planType: "data",      retailPriceUsd: 6.99  },
  { regionCode: "NG", destinationId: DEST.NG, name: "Nigeria 3 GB / 30 Days", dataMb: 3072,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 12.99 },
  // ── South Africa ──
  { regionCode: "ZA", destinationId: DEST.ZA, name: "South Africa 1 GB / 7 Days",  dataMb: 1024, validityDays: 7,  isUnlimited: false, planType: "data", retailPriceUsd: 6.49 },
  { regionCode: "ZA", destinationId: DEST.ZA, name: "South Africa 3 GB / 30 Days", dataMb: 3072, validityDays: 30, isUnlimited: false, planType: "data", retailPriceUsd: 12.49 },
  // ── Kenya ──
  { regionCode: "KE", destinationId: DEST.KE, name: "Kenya 1 GB / 7 Days",    dataMb: 1024,   validityDays: 7,  isUnlimited: false, planType: "data",      retailPriceUsd: 6.99  },
  { regionCode: "KE", destinationId: DEST.KE, name: "Kenya 3 GB / 30 Days",   dataMb: 3072,   validityDays: 30, isUnlimited: false, planType: "data",      retailPriceUsd: 12.99 },
];

// ─── Main seed function ──────────────────────────────────────────────────────

export async function seedProviderRegistry(): Promise<void> {
  console.log("[seed:registry] Starting provider registry seed…");

  // 1. Insert providers only when absent. Never overwrite health, quarantine,
  // enablement, priority, or metadata maintained by probes/admins.
  for (const p of PROVIDERS) {
    const [existing] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.key, p.key))
      .limit(1);
    if (existing) {
      console.log(`[seed:registry] Provider preserved: ${p.key}`);
      continue;
    }
    await db.insert(providers).values(p);
    console.log(`[seed:registry] Provider inserted: ${p.key}`);
  }

  // 2. Insert normalized plans only when absent (find-or-create by regionCode + name)
  for (const def of PLAN_DEFS) {
    // Check if already exists
    const existing = await db
      .select()
      .from(normalizedPlans)
      .where(and(
        eq(normalizedPlans.regionCode, def.regionCode),
        eq(normalizedPlans.name, def.name),
      ));

    let planId: string;
    if (existing.length > 0) {
      planId = existing[0].id;
      console.log(`[seed:registry] Plan exists: "${def.name}" (${planId})`);
    } else {
      const created = await createNormalizedPlan({
        destinationId: def.destinationId,
        regionCode: def.regionCode,
        name: def.name,
        dataMb: def.dataMb,
        validityDays: def.validityDays,
        isUnlimited: def.isUnlimited,
        planType: def.planType,
        retailPriceUsd: def.retailPriceUsd,
        isActive: true,
      });
      planId = created.id;
      console.log(`[seed:registry] Plan created: "${def.name}" (${planId})`);
    }
  }

  // Provider offers are deliberately not seeded. Supplier SKUs and prices are
  // live catalogue data and may only be written by providerSync after a real
  // supplier response. Existing offers remain untouched by this seed.
  console.log(`[seed:registry] Done — ${PROVIDERS.length} providers, ${PLAN_DEFS.length} plans; live offers unchanged.`);
}
