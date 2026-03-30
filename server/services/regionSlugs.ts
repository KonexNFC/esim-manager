// ─── Canonical Region Slugs ───────────────────────────────────────────────────
// Defines multi-country region identifiers used as regionCode in normalized_plans
// when a plan covers more than one country or the whole world.
//
// Slugs are uppercase strings that are longer than 2-3 chars so they never
// collide with ISO-2 / ISO-3 country codes.

export type RegionSlug =
  | "GLOBAL"
  | "EUROPE"
  | "APAC"
  | "LATAM"
  | "MENA"
  | "AFRICA"
  | "NORTHAM"
  | "SEASIA"
  | "SOUTHASIA"
  | "CARIBBEAN";

export interface RegionMeta {
  slug: RegionSlug;
  name: string;
  flagEmoji: string;
  sortOrder: number;
  coverageType: "regional" | "global";
}

export const REGION_META: Record<RegionSlug, RegionMeta> = {
  GLOBAL:    { slug: "GLOBAL",    name: "Global",                    flagEmoji: "🌍", sortOrder: 0,  coverageType: "global" },
  EUROPE:    { slug: "EUROPE",    name: "Europe",                    flagEmoji: "🇪🇺", sortOrder: 1,  coverageType: "regional" },
  NORTHAM:   { slug: "NORTHAM",   name: "North America",             flagEmoji: "🌎", sortOrder: 2,  coverageType: "regional" },
  LATAM:     { slug: "LATAM",     name: "Latin America",             flagEmoji: "🌎", sortOrder: 3,  coverageType: "regional" },
  CARIBBEAN: { slug: "CARIBBEAN", name: "Caribbean",                 flagEmoji: "🏝️", sortOrder: 4,  coverageType: "regional" },
  APAC:      { slug: "APAC",      name: "Asia Pacific",              flagEmoji: "🌏", sortOrder: 5,  coverageType: "regional" },
  SEASIA:    { slug: "SEASIA",    name: "Southeast Asia",            flagEmoji: "🌏", sortOrder: 6,  coverageType: "regional" },
  SOUTHASIA: { slug: "SOUTHASIA", name: "South Asia",                flagEmoji: "🌏", sortOrder: 7,  coverageType: "regional" },
  MENA:      { slug: "MENA",      name: "Middle East & North Africa",flagEmoji: "🌍", sortOrder: 8,  coverageType: "regional" },
  AFRICA:    { slug: "AFRICA",    name: "Africa",                    flagEmoji: "🌍", sortOrder: 9,  coverageType: "regional" },
};

export const ALL_REGION_SLUGS = Object.keys(REGION_META) as RegionSlug[];

export function isRegionSlug(code: string): code is RegionSlug {
  return code in REGION_META;
}

export function getRegionMeta(slug: string): RegionMeta | null {
  return REGION_META[slug as RegionSlug] ?? null;
}

// ─── eSIMGo group → slug ──────────────────────────────────────────────────────
// The `groups` array in the eSIMGo catalogue typically contains the region
// (e.g., "europe", "global") plus sometimes the country name.

const ESIMGO_GROUP_MAP: Record<string, RegionSlug> = {
  "europe":               "EUROPE",
  "european union":       "EUROPE",
  "asia pacific":         "APAC",
  "apac":                 "APAC",
  "east asia":            "APAC",
  "asia":                 "APAC",
  "latin america":        "LATAM",
  "latam":                "LATAM",
  "south america":        "LATAM",
  "central and south america": "LATAM",
  "americas":             "LATAM",
  "middle east":          "MENA",
  "mena":                 "MENA",
  "middle east & africa": "MENA",
  "middle east and africa": "MENA",
  "north africa":         "MENA",
  "africa":               "AFRICA",
  "sub-saharan africa":   "AFRICA",
  "north america":        "NORTHAM",
  "southeast asia":       "SEASIA",
  "south-east asia":      "SEASIA",
  "south asia":           "SOUTHASIA",
  "caribbean":            "CARIBBEAN",
  "global":               "GLOBAL",
  "worldwide":            "GLOBAL",
  "world":                "GLOBAL",
};

/** Derive a canonical region slug from an eSIMGo item's groups array. */
export function regionSlugFromEsimGoGroups(groups: string[]): RegionSlug | null {
  for (const g of groups) {
    const mapped = ESIMGO_GROUP_MAP[g.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  return null;
}

// ─── Zendit regions → slug ────────────────────────────────────────────────────

const ZENDIT_REGION_MAP: Record<string, RegionSlug> = {
  // Global
  "global":                   "GLOBAL",
  "worldwide":                 "GLOBAL",
  "world":                     "GLOBAL",
  "international":             "GLOBAL",
  // Europe
  "europe":                    "EUROPE",
  "european":                  "EUROPE",
  "eu":                        "EUROPE",
  "european union":            "EUROPE",
  // Americas
  "latin america":             "LATAM",
  "south america":             "LATAM",
  "central america":           "LATAM",
  "latin america & caribbean": "LATAM",
  "north america":             "NORTHAM",
  // Caribbean
  "caribbean":                 "CARIBBEAN",
  // Asia Pacific
  "asia pacific":              "APAC",
  "east asia":                 "APAC",
  "asia":                      "APAC",
  "apac":                      "APAC",
  "pacific":                   "APAC",
  "oceania":                   "APAC",
  // Southeast Asia
  "southeast asia":            "SEASIA",
  "south-east asia":           "SEASIA",
  "asean":                     "SEASIA",
  // South Asia
  "south asia":                "SOUTHASIA",
  "subcontinent":              "SOUTHASIA",
  // MENA
  "middle east":               "MENA",
  "middle east & north africa":"MENA",
  "middle east and africa":    "MENA",
  "north africa":              "MENA",
  "mena":                      "MENA",
  "gulf":                      "MENA",
  // Africa
  "africa":                    "AFRICA",
  "sub-saharan africa":        "AFRICA",
  "africa roaming":            "AFRICA",
  "african":                   "AFRICA",
};

/**
 * Derive a canonical region slug from a Zendit offer's regions array.
 * Returns null if no mapping found.
 */
export function regionSlugFromZenditRegions(regions: string[]): RegionSlug | null {
  // Check global first (highest priority)
  for (const r of regions) {
    const lower = r.toLowerCase().trim();
    if (lower === "global" || lower.includes("global") || lower === "worldwide") return "GLOBAL";
  }
  // Try other mappings in order
  for (const r of regions) {
    const mapped = ZENDIT_REGION_MAP[r.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  // Partial match fallback
  for (const r of regions) {
    const lower = r.toLowerCase().trim();
    for (const [key, slug] of Object.entries(ZENDIT_REGION_MAP)) {
      if (lower.includes(key) || key.includes(lower)) return slug;
    }
  }
  return null;
}
