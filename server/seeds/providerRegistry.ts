// ─── Provider Registry Seed ───────────────────────────────────────────────────
// Idempotent seed for providers, normalized_plans, and provider_offers.
// Safe to run multiple times — uses upsert patterns throughout.

import { upsertProvider, createNormalizedPlan, upsertProviderOffer, getNormalizedPlansByRegion } from "../services/providerRegistry";
import { db } from "../storage";
import { normalizedPlans, destinations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ─── 1. Provider Registry ────────────────────────────────────────────────────

const PROVIDERS = [
  {
    key: "esimgo",
    name: "eSIMGo",
    enabled: true,
    priority: 1,
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
    priority: 3,
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

// ─── 3. Provider Offer mappings ──────────────────────────────────────────────
// normalizedPlanName → array of { providerKey, providerPlanCode, wholesalePriceUsd }
// eSIMGo codes: confirmed via live API catalogue
// eSIM Access codes: follow their naming convention; update with real codes from API
// Zendit codes: stubs — disabled until key is supplied

type OfferDef = { providerKey: string; providerPlanCode: string; wholesalePriceUsd: number };

const OFFER_MAP: Record<string, OfferDef[]> = {
  "UK 1 GB / 7 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_1GB_7D_GB_V2",          wholesalePriceUsd: 1.36  },
    { providerKey: "esimaccess", providerPlanCode: "EA_GB_1GB_7D",               wholesalePriceUsd: 1.50  },
    { providerKey: "zendit",     providerPlanCode: "ZENDIT_GB_1GB_7D",            wholesalePriceUsd: 1.45  },
  ],
  "UK 3 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_30D_GB_V2",          wholesalePriceUsd: 2.83  },
    { providerKey: "esimaccess", providerPlanCode: "EA_GB_3GB_30D",              wholesalePriceUsd: 3.00  },
    { providerKey: "zendit",     providerPlanCode: "ZENDIT_GB_3GB_30D",           wholesalePriceUsd: 2.95  },
  ],
  "UK 5 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_5GB_30D_GB_V2",          wholesalePriceUsd: 4.36  },
    { providerKey: "esimaccess", providerPlanCode: "EA_GB_5GB_30D",              wholesalePriceUsd: 4.60  },
    { providerKey: "zendit",     providerPlanCode: "ZENDIT_GB_5GB_30D",           wholesalePriceUsd: 4.50  },
  ],
  "UK 10 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_10GB_30D_GB_V2",         wholesalePriceUsd: 7.59  },
    { providerKey: "esimaccess", providerPlanCode: "EA_GB_10GB_30D",             wholesalePriceUsd: 8.00  },
    { providerKey: "zendit",     providerPlanCode: "ZENDIT_GB_10GB_30D",          wholesalePriceUsd: 7.80  },
  ],
  "UK Unlimited / 1 Day": [
    { providerKey: "esimgo",     providerPlanCode: "esim_UL_1D_GB_V2",            wholesalePriceUsd: 1.70  },
    { providerKey: "esimaccess", providerPlanCode: "EA_GB_UNL_1D",              wholesalePriceUsd: 1.85  },
  ],
  "UK Unlimited / 7 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_UL_7D_GB_V2",            wholesalePriceUsd: 8.63  },
    { providerKey: "esimaccess", providerPlanCode: "EA_GB_UNL_7D",              wholesalePriceUsd: 9.00  },
  ],
  "USA 3 GB / 15 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_15D_US_V2",          wholesalePriceUsd: 3.50  },
    { providerKey: "esimaccess", providerPlanCode: "EA_US_3GB_15D",             wholesalePriceUsd: 3.70  },
    { providerKey: "zendit",     providerPlanCode: "ZENDIT_US_3GB_15D",           wholesalePriceUsd: 3.60  },
  ],
  "USA 5 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_5GB_30D_US_V2",          wholesalePriceUsd: 5.50  },
    { providerKey: "esimaccess", providerPlanCode: "EA_US_5GB_30D",             wholesalePriceUsd: 5.80  },
    { providerKey: "zendit",     providerPlanCode: "ZENDIT_US_5GB_30D",           wholesalePriceUsd: 5.65  },
  ],
  "USA 10 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_10GB_30D_US_V2",         wholesalePriceUsd: 9.50  },
    { providerKey: "esimaccess", providerPlanCode: "EA_US_10GB_30D",            wholesalePriceUsd: 9.90  },
  ],
  "France 1 GB / 7 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_1GB_7D_FR_V2",           wholesalePriceUsd: 1.36  },
    { providerKey: "esimaccess", providerPlanCode: "EA_FR_1GB_7D",              wholesalePriceUsd: 1.50  },
  ],
  "France 3 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_30D_FR_V2",          wholesalePriceUsd: 2.83  },
    { providerKey: "esimaccess", providerPlanCode: "EA_FR_3GB_30D",             wholesalePriceUsd: 3.00  },
  ],
  "France 5 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_5GB_30D_FR_V2",          wholesalePriceUsd: 4.36  },
    { providerKey: "esimaccess", providerPlanCode: "EA_FR_5GB_30D",             wholesalePriceUsd: 4.60  },
  ],
  "Thailand 3 GB / 15 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_15D_TH_V2",          wholesalePriceUsd: 2.50  },
    { providerKey: "esimaccess", providerPlanCode: "EA_TH_3GB_15D",            wholesalePriceUsd: 2.70  },
  ],
  "Thailand 5 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_5GB_30D_TH_V2",          wholesalePriceUsd: 3.80  },
    { providerKey: "esimaccess", providerPlanCode: "EA_TH_5GB_30D",            wholesalePriceUsd: 4.00  },
  ],
  "UAE 2 GB / 15 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_2GB_15D_AE_V2",          wholesalePriceUsd: 3.00  },
    { providerKey: "esimaccess", providerPlanCode: "EA_AE_2GB_15D",            wholesalePriceUsd: 3.20  },
  ],
  "UAE 5 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_5GB_30D_AE_V2",          wholesalePriceUsd: 5.50  },
    { providerKey: "esimaccess", providerPlanCode: "EA_AE_5GB_30D",            wholesalePriceUsd: 5.80  },
  ],
  "Japan 3 GB / 15 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_15D_JP_V2",          wholesalePriceUsd: 3.80  },
    { providerKey: "esimaccess", providerPlanCode: "EA_JP_3GB_15D",            wholesalePriceUsd: 4.00  },
  ],
  "Japan 5 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_5GB_30D_JP_V2",          wholesalePriceUsd: 5.80  },
    { providerKey: "esimaccess", providerPlanCode: "EA_JP_5GB_30D",            wholesalePriceUsd: 6.10  },
  ],
  "Nigeria 1 GB / 7 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_1GB_7D_NG_V2",           wholesalePriceUsd: 2.00  },
    { providerKey: "esimaccess", providerPlanCode: "EA_NG_1GB_7D",             wholesalePriceUsd: 2.20  },
  ],
  "Nigeria 3 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_30D_NG_V2",          wholesalePriceUsd: 4.00  },
    { providerKey: "esimaccess", providerPlanCode: "EA_NG_3GB_30D",            wholesalePriceUsd: 4.30  },
  ],
  "South Africa 1 GB / 7 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_1GB_7D_ZA_V2",           wholesalePriceUsd: 1.80  },
    { providerKey: "esimaccess", providerPlanCode: "EA_ZA_1GB_7D",             wholesalePriceUsd: 2.00  },
  ],
  "South Africa 3 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_30D_ZA_V2",          wholesalePriceUsd: 3.60  },
    { providerKey: "esimaccess", providerPlanCode: "EA_ZA_3GB_30D",            wholesalePriceUsd: 3.80  },
  ],
  "Kenya 1 GB / 7 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_1GB_7D_KE_V2",           wholesalePriceUsd: 2.00  },
    { providerKey: "esimaccess", providerPlanCode: "EA_KE_1GB_7D",             wholesalePriceUsd: 2.20  },
  ],
  "Kenya 3 GB / 30 Days": [
    { providerKey: "esimgo",     providerPlanCode: "esim_3GB_30D_KE_V2",          wholesalePriceUsd: 4.00  },
    { providerKey: "esimaccess", providerPlanCode: "EA_KE_3GB_30D",            wholesalePriceUsd: 4.30  },
  ],
};

// ─── Main seed function ──────────────────────────────────────────────────────

export async function seedProviderRegistry(): Promise<void> {
  console.log("[seed:registry] Starting provider registry seed…");

  // 1. Upsert providers
  for (const p of PROVIDERS) {
    await upsertProvider(p);
    console.log(`[seed:registry] Provider upserted: ${p.key} (priority=${p.priority}, enabled=${p.enabled})`);
  }

  // 2. Upsert normalized plans (find-or-create by regionCode + name)
  const planIdMap = new Map<string, string>(); // name → id

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
    planIdMap.set(def.name, planId);
  }

  // 3. Upsert provider offers
  let offersCreated = 0;
  for (const [planName, offers] of Object.entries(OFFER_MAP)) {
    const planId = planIdMap.get(planName);
    if (!planId) {
      console.warn(`[seed:registry] No planId found for "${planName}" — skipping offers`);
      continue;
    }
    for (const offer of offers) {
      await upsertProviderOffer({
        normalizedPlanId: planId,
        providerKey: offer.providerKey,
        providerPlanCode: offer.providerPlanCode,
        wholesalePriceUsd: offer.wholesalePriceUsd,
        currency: "USD",
        isActive: true,
      });
      offersCreated++;
    }
  }

  console.log(`[seed:registry] Done — ${PROVIDERS.length} providers, ${PLAN_DEFS.length} plans, ${offersCreated} offers seeded.`);
}
