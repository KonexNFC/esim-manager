// ─── DB Supplier Plans Loader ─────────────────────────────────────────────────
// Reads live plan data from provider_offers + normalized_plans and converts it
// into the SupplierPlan[] format consumed by the catalogue pipeline.
//
// Strategy:
//  • Filter by region_code = countryCode (covers country-specific AND regional
//    fan-out plans created during provider sync)
//  • Optionally include global plans (region_code = 'GLOBAL')
//  • Only active offers from enabled, non-paused providers

import { sql } from "drizzle-orm";
import { db } from "../storage";
import { Category, PlanStatus, SupplierPlan } from "./supplier-plan.types";

type OfferRow = {
  id: string;
  normalized_plan_id: string;
  provider_key: string;
  region_code: string;
  validity_days: number;
  data_mb: number | null;
  is_unlimited: boolean;
  wholesale_price_usd: number;
  coverage_type: string | null;
};

/**
 * Load all active provider offers for a country code and return them as
 * SupplierPlan objects ready for the catalogue pipeline.
 *
 * @param countryCode  ISO-2 or region slug (e.g. "FR", "US", "GLOBAL")
 * @param includeGlobal  Also include plans tagged as global coverage (default: true)
 */
export async function getDbSupplierPlans(
  countryCode: string,
  includeGlobal = true,
): Promise<SupplierPlan[]> {
  const code = countryCode.toUpperCase();

  const rows = await db.execute<OfferRow>(sql`
    SELECT
      po.id,
      po.normalized_plan_id,
      po.provider_key,
      np.region_code,
      np.validity_days,
      np.data_mb,
      np.is_unlimited,
      po.wholesale_price_usd,
      po.coverage_type
    FROM provider_offers po
    JOIN normalized_plans np ON np.id = po.normalized_plan_id
    JOIN providers p ON p.key = po.provider_key
    WHERE
      (
        np.region_code = ${code}
        ${includeGlobal ? sql`OR np.region_code = 'GLOBAL'` : sql``}
      )
      AND po.is_active  = true
      AND np.is_active  = true
      AND p.enabled     = true
      AND p.auto_paused = false
      AND po.wholesale_price_usd > 0
      -- Only include providers that have a registered purchase adapter.
      -- Update this list when a new adapter is implemented.
      AND po.provider_key IN ('esimgo', 'esimaccess', 'zendit', 'airalo', 'mock')
    ORDER BY po.wholesale_price_usd ASC
  `);

  return rows.rows.map((row): SupplierPlan => {
    const dataMb = row.is_unlimited ? null : (row.data_mb ?? null);
    return {
      id: row.id,
      normalizedPlanId: row.normalized_plan_id,
      supplier: mapProviderKey(row.provider_key),
      countryCode: code,
      validityDays: row.validity_days,
      dataMb,
      isUnlimited: row.is_unlimited,
      // The stored offer has no supplier-confirmed tethering information.
      hotspotSupported: null,
      wholesaleCostUsd: row.wholesale_price_usd,
      category: Category.TRAVEL,
      status: PlanStatus.ACTIVE,
    };
  });
}

function mapProviderKey(key: string): "esimgo" | "esimaccess" | "zendit" | "airalo" | "breeze" {
  if (key === "esimgo") return "esimgo";
  if (key === "esimaccess") return "esimaccess";
  if (key === "zendit") return "zendit";
  if (key === "airalo") return "airalo";
  return "breeze";
}
