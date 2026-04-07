// ─── Mock Seed Data ───────────────────────────────────────────────────────────
// Intentionally inconsistent supplier inputs to stress-test the normalisation
// and synthetic bundling pipeline.
//
// US:  only 1-day unlimited + 1-day 1.5 GB (esimgo) and a 7-day 10 GB (breeze).
//      The system must synthesise DAY_3, DAY_5 bundles automatically.
//      Also includes hidden M2M / M2D plans that must not appear publicly.
//
// UK:  full native coverage across all four buckets (unlimited + fixed).
//      Used to verify that the pipeline doesn't over-generate synthetics.

import { Category, PlanStatus, SupplierPlan } from "./supplier-plan.types";

export const MOCK_SUPPLIER_PLANS: SupplierPlan[] = [
  // ── United States ──────────────────────────────────────────────────────────

  {
    id: "us-esimgo-1d-unlimited",
    supplier: "esimgo",
    countryCode: "US",
    validityDays: 1,
    dataMb: null,
    isUnlimited: true,
    hotspotSupported: true,
    wholesaleCostUsd: 1.81,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "us-esimgo-1d-1500mb",
    supplier: "esimgo",
    countryCode: "US",
    validityDays: 1,
    dataMb: 1500,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 1.6,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    // 7-day 10 GB from a different supplier — no 3/5-day native supply
    id: "us-breeze-7d-10gb",
    supplier: "breeze",
    countryCode: "US",
    validityDays: 7,
    dataMb: 10240,
    isUnlimited: false,
    hotspotSupported: true,
    wholesaleCostUsd: 4.95,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    // Hidden M2M plan — must NOT appear in public catalogue
    id: "us-esimgo-m2m-7d-50gb",
    supplier: "esimgo",
    countryCode: "US",
    validityDays: 7,
    dataMb: 51200,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 8.0,
    category: Category.M2M_BULK,
    status: PlanStatus.ACTIVE,
  },
  {
    // Hidden M2D plan — admin only
    id: "us-esimaccess-m2d-7d-unlimited",
    supplier: "esimaccess",
    countryCode: "US",
    validityDays: 7,
    dataMb: null,
    isUnlimited: true,
    hotspotSupported: true,
    wholesaleCostUsd: 12.0,
    category: Category.M2D_BULK,
    status: PlanStatus.ACTIVE,
  },

  // ── United Kingdom ─────────────────────────────────────────────────────────

  // Native unlimited plans for all four buckets
  {
    id: "gb-esimgo-1d-unlimited",
    supplier: "esimgo",
    countryCode: "GB",
    validityDays: 1,
    dataMb: null,
    isUnlimited: true,
    hotspotSupported: true,
    wholesaleCostUsd: 0.93,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "gb-esimgo-3d-unlimited",
    supplier: "esimgo",
    countryCode: "GB",
    validityDays: 3,
    dataMb: null,
    isUnlimited: true,
    hotspotSupported: true,
    wholesaleCostUsd: 2.52,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "gb-esimgo-5d-unlimited",
    supplier: "esimgo",
    countryCode: "GB",
    validityDays: 5,
    dataMb: null,
    isUnlimited: true,
    hotspotSupported: true,
    wholesaleCostUsd: 4.11,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "gb-esimgo-7d-unlimited",
    supplier: "esimgo",
    countryCode: "GB",
    validityDays: 7,
    dataMb: null,
    isUnlimited: true,
    hotspotSupported: true,
    wholesaleCostUsd: 5.7,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },

  // Fixed-data alternatives (breeze supplier)
  {
    id: "gb-breeze-1d-2gb",
    supplier: "breeze",
    countryCode: "GB",
    validityDays: 1,
    dataMb: 2048,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 0.8,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "gb-breeze-3d-3gb",
    supplier: "breeze",
    countryCode: "GB",
    validityDays: 3,
    dataMb: 3072,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 2.0,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "gb-breeze-5d-5gb",
    supplier: "breeze",
    countryCode: "GB",
    validityDays: 5,
    dataMb: 5120,
    isUnlimited: false,
    hotspotSupported: true,
    wholesaleCostUsd: 3.5,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },
  {
    id: "gb-breeze-7d-7gb",
    supplier: "breeze",
    countryCode: "GB",
    validityDays: 7,
    dataMb: 7168,
    isUnlimited: false,
    hotspotSupported: true,
    wholesaleCostUsd: 5.0,
    category: Category.TRAVEL,
    status: PlanStatus.ACTIVE,
  },

  // Hidden M2M plan for UK — admin only
  {
    id: "gb-esimaccess-m2m-30d-100gb",
    supplier: "esimaccess",
    countryCode: "GB",
    validityDays: 30,
    dataMb: 102400,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 25.0,
    category: Category.M2M_BULK,
    status: PlanStatus.ACTIVE,
  },

  // Disabled plan — should be excluded from all catalogues
  {
    id: "gb-breeze-1d-500mb-legacy",
    supplier: "breeze",
    countryCode: "GB",
    validityDays: 1,
    dataMb: 500,
    isUnlimited: false,
    hotspotSupported: false,
    wholesaleCostUsd: 0.3,
    category: Category.TRAVEL,
    status: PlanStatus.DISABLED,
  },
];
