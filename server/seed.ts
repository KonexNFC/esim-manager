import { db } from "./storage";
import { destinations, plans } from "@shared/schema";

export async function seedDatabase() {
  const existingDests = await db.select().from(destinations);
  if (existingDests.length > 0) return;

  console.log("Seeding database...");

  const destData = [
    { name: "Japan", countryCode: "JP", region: "Asia", imageUrl: "/images/destinations/japan.png", flagEmoji: "\u{1F1EF}\u{1F1F5}", popular: true },
    { name: "France", countryCode: "FR", region: "Europe", imageUrl: "/images/destinations/france.png", flagEmoji: "\u{1F1EB}\u{1F1F7}", popular: true },
    { name: "United Arab Emirates", countryCode: "AE", region: "Middle East", imageUrl: "/images/destinations/uae.png", flagEmoji: "\u{1F1E6}\u{1F1EA}", popular: true },
    { name: "Indonesia", countryCode: "ID", region: "Southeast Asia", imageUrl: "/images/destinations/indonesia.png", flagEmoji: "\u{1F1EE}\u{1F1E9}", popular: true },
    { name: "United States", countryCode: "US", region: "North America", imageUrl: "/images/destinations/usa.png", flagEmoji: "\u{1F1FA}\u{1F1F8}", popular: true },
    { name: "United Kingdom", countryCode: "GB", region: "Europe", imageUrl: "/images/destinations/uk.png", flagEmoji: "\u{1F1EC}\u{1F1E7}", popular: true },
    { name: "Thailand", countryCode: "TH", region: "Southeast Asia", imageUrl: "/images/destinations/thailand.png", flagEmoji: "\u{1F1F9}\u{1F1ED}", popular: true },
    { name: "Turkey", countryCode: "TR", region: "Europe", imageUrl: "/images/destinations/turkey.png", flagEmoji: "\u{1F1F9}\u{1F1F7}", popular: true },
  ];

  const insertedDests = await db.insert(destinations).values(destData).returning();

  const planTemplates = [
    { suffix: "Lite", dataAmount: "1 GB", dataAmountGb: 1, validity: "7 Days", validityDays: 7, priceBase: 4.99, speedInfo: "4G/LTE", features: ["Data only", "Instant activation", "No contract"] },
    { suffix: "Standard", dataAmount: "3 GB", dataAmountGb: 3, validity: "15 Days", validityDays: 15, priceBase: 9.99, speedInfo: "4G/LTE", features: ["Data only", "Instant activation", "No contract", "Hotspot enabled"], popular: true },
    { suffix: "Plus", dataAmount: "5 GB", dataAmountGb: 5, validity: "30 Days", validityDays: 30, priceBase: 14.99, speedInfo: "4G/5G", features: ["Data only", "Instant activation", "No contract", "Hotspot enabled", "5G where available"] },
    { suffix: "Unlimited", dataAmount: "Unlimited", dataAmountGb: 999, validity: "30 Days", validityDays: 30, priceBase: 24.99, speedInfo: "4G/5G", features: ["Unlimited data", "Instant activation", "No contract", "Hotspot enabled", "5G where available", "Fair usage: 1GB/day high speed"] },
  ];

  const priceMultipliers: Record<string, number> = {
    JP: 1.2, FR: 1.0, AE: 1.3, ID: 0.8, US: 1.4, GB: 1.1, TH: 0.7, TR: 0.9,
  };

  const allPlans = insertedDests.flatMap((dest) => {
    const mult = priceMultipliers[dest.countryCode] || 1;
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
      popular: tmpl.popular || false,
    }));
  });

  await db.insert(plans).values(allPlans);
  console.log(`Seeded ${insertedDests.length} destinations and ${allPlans.length} plans`);
}
