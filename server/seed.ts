import { db } from "./storage";
import { destinations, plans } from "@shared/schema";

const planTemplates = [
  { suffix: "Day Pass", dataAmount: "1 GB", dataAmountGb: 1, validity: "7 Days", validityDays: 7, priceBase: 4.99, speedInfo: "4G/LTE", features: ["Data only", "Instant activation", "No contract"] },
  { suffix: "Travel Pack", dataAmount: "3 GB", dataAmountGb: 3, validity: "15 Days", validityDays: 15, priceBase: 9.99, speedInfo: "4G/LTE", features: ["Data only", "Instant activation", "No contract", "Hotspot enabled"], popular: true },
  { suffix: "Regional Bundle", dataAmount: "5 GB", dataAmountGb: 5, validity: "30 Days", validityDays: 30, priceBase: 14.99, speedInfo: "4G/5G", features: ["Data only", "Instant activation", "No contract", "Hotspot enabled", "5G where available"] },
  { suffix: "Unlimited", dataAmount: "Unlimited", dataAmountGb: 999, validity: "30 Days", validityDays: 30, priceBase: 24.99, speedInfo: "4G/5G", features: ["Unlimited data", "Instant activation", "No contract", "Hotspot enabled", "5G where available", "Fair usage: 1GB/day high speed"] },
];

async function seedPlansForDests(insertedDests: { id: string; countryCode: string; name: string }[], wholesaleCosts: Record<string, number>, priceMultipliers: Record<string, number>) {
  const allPlans = insertedDests.flatMap((dest) => {
    const mult = priceMultipliers[dest.countryCode] || 1;
    const wc = wholesaleCosts[dest.countryCode] || 2.0;
    return planTemplates.map((tmpl) => ({
      destinationId: dest.id,
      name: `${dest.name} ${tmpl.suffix}`,
      dataAmount: tmpl.dataAmount,
      dataAmountGb: tmpl.dataAmountGb,
      validity: tmpl.validity,
      validityDays: tmpl.validityDays,
      price: Math.round(tmpl.priceBase * mult * 100) / 100,
      currency: "USD",
      speedInfo: tmpl.speedInfo,
      coverage: dest.name,
      features: tmpl.features,
      popular: (tmpl as any).popular || false,
      planStatus: "live" as const,
      wholesaleCost: Math.round(wc * tmpl.dataAmountGb * 0.3 * 100) / 100,
    }));
  });
  if (allPlans.length > 0) await db.insert(plans).values(allPlans);
}

export async function seedDatabase() {
  const existingDests = await db.select().from(destinations);

  if (existingDests.length === 0) {
    console.log("Seeding database...");

    const destData = [
      { name: "Japan", countryCode: "JP", region: "Asia", imageUrl: "/images/destinations/japan.png", flagEmoji: "🇯🇵", popular: true, corridor: null },
      { name: "France", countryCode: "FR", region: "Europe", imageUrl: "/images/destinations/france.png", flagEmoji: "🇫🇷", popular: true, corridor: "UK ↔ EU" },
      { name: "United Arab Emirates", countryCode: "AE", region: "Middle East", imageUrl: "/images/destinations/uae.png", flagEmoji: "🇦🇪", popular: true, corridor: "UK ↔ UAE" },
      { name: "Indonesia", countryCode: "ID", region: "Southeast Asia", imageUrl: "/images/destinations/indonesia.png", flagEmoji: "🇮🇩", popular: true, corridor: null },
      { name: "United States", countryCode: "US", region: "North America", imageUrl: "/images/destinations/usa.png", flagEmoji: "🇺🇸", popular: true, corridor: "Global" },
      { name: "United Kingdom", countryCode: "GB", region: "Europe", imageUrl: "/images/destinations/uk.png", flagEmoji: "🇬🇧", popular: true, corridor: "UK ↔ EU" },
      { name: "Thailand", countryCode: "TH", region: "Southeast Asia", imageUrl: "/images/destinations/thailand.png", flagEmoji: "🇹🇭", popular: true, corridor: "Global" },
      { name: "Turkey", countryCode: "TR", region: "Europe", imageUrl: "/images/destinations/turkey.png", flagEmoji: "🇹🇷", popular: true, corridor: "UK ↔ EU" },
      { name: "Nigeria", countryCode: "NG", region: "Africa", imageUrl: "/images/destinations/nigeria.png", flagEmoji: "🇳🇬", popular: true, corridor: "UK ↔ Africa" },
      { name: "Kenya", countryCode: "KE", region: "Africa", imageUrl: "/images/destinations/kenya.png", flagEmoji: "🇰🇪", popular: true, corridor: null },
      { name: "South Africa", countryCode: "ZA", region: "Africa", imageUrl: "/images/destinations/south-africa.png", flagEmoji: "🇿🇦", popular: true, corridor: null },
      { name: "Egypt", countryCode: "EG", region: "Africa", imageUrl: "/images/destinations/egypt.png", flagEmoji: "🇪🇬", popular: true, corridor: null },
      { name: "Morocco", countryCode: "MA", region: "Africa", imageUrl: "/images/destinations/morocco.png", flagEmoji: "🇲🇦", popular: true, corridor: null },
      { name: "Ghana", countryCode: "GH", region: "Africa", imageUrl: "/images/destinations/ghana.png", flagEmoji: "🇬🇭", popular: false, corridor: null },
    ];

    const insertedDests = await db.insert(destinations).values(destData).returning();

    const wholesaleCosts: Record<string, number> = {
      JP: 2.50, FR: 1.80, AE: 2.80, ID: 1.50, US: 3.00, GB: 2.00, TH: 1.20, TR: 1.60,
      NG: 1.20, KE: 1.10, ZA: 1.40, EG: 1.30, MA: 1.25, GH: 1.10,
    };
    const priceMultipliers: Record<string, number> = {
      JP: 1.2, FR: 1.0, AE: 1.3, ID: 0.8, US: 1.4, GB: 1.1, TH: 0.7, TR: 0.9,
      NG: 0.85, KE: 0.80, ZA: 0.90, EG: 0.85, MA: 0.88, GH: 0.82,
    };

    await seedPlansForDests(insertedDests, wholesaleCosts, priceMultipliers);
    console.log(`Seeded ${insertedDests.length} destinations and ${insertedDests.length * planTemplates.length} plans`);
    return;
  }

  // Add Africa destinations if not yet present
  const africaDestData = [
    { name: "Nigeria", countryCode: "NG", region: "Africa", imageUrl: "/images/destinations/nigeria.png", flagEmoji: "🇳🇬", popular: true, corridor: "UK ↔ Africa" },
    { name: "Kenya", countryCode: "KE", region: "Africa", imageUrl: "/images/destinations/kenya.png", flagEmoji: "🇰🇪", popular: true, corridor: null },
    { name: "South Africa", countryCode: "ZA", region: "Africa", imageUrl: "/images/destinations/south-africa.png", flagEmoji: "🇿🇦", popular: true, corridor: null },
    { name: "Egypt", countryCode: "EG", region: "Africa", imageUrl: "/images/destinations/egypt.png", flagEmoji: "🇪🇬", popular: true, corridor: null },
    { name: "Morocco", countryCode: "MA", region: "Africa", imageUrl: "/images/destinations/morocco.png", flagEmoji: "🇲🇦", popular: true, corridor: null },
    { name: "Ghana", countryCode: "GH", region: "Africa", imageUrl: "/images/destinations/ghana.png", flagEmoji: "🇬🇭", popular: false, corridor: null },
  ];

  const existingCodes = new Set(existingDests.map((d) => d.countryCode));
  const toInsert = africaDestData.filter((d) => !existingCodes.has(d.countryCode));

  if (toInsert.length > 0) {
    console.log(`Seeding ${toInsert.length} Africa destinations...`);
    const insertedDests = await db.insert(destinations).values(toInsert).returning();
    const wholesaleCosts: Record<string, number> = { NG: 1.20, KE: 1.10, ZA: 1.40, EG: 1.30, MA: 1.25, GH: 1.10 };
    const priceMultipliers: Record<string, number> = { NG: 0.85, KE: 0.80, ZA: 0.90, EG: 0.85, MA: 0.88, GH: 0.82 };
    await seedPlansForDests(insertedDests, wholesaleCosts, priceMultipliers);
    console.log(`Added ${insertedDests.length} Africa destinations with plans`);
  }
}
