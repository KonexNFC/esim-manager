type Offer = { quote?: unknown; isSynthetic?: boolean };
type Slot = {
  recommended: Offer | null;
  cheaper: Offer | null;
  premium: Offer | null;
  browseAll: Offer[];
};
type Catalogue = { durations: Record<string, Slot>; availableDurations: string[]; defaultDuration: string };
const ORDER = ["DAY_1", "DAY_3", "DAY_5", "DAY_7", "DAY_14", "DAY_30"];

/** Presentation-only projection of offers that survived signed quotation. */
export function purchasableCatalogue<T extends Catalogue>(catalogue: T): T {
  const keep = <P extends Offer>(plan: P | null): P | null =>
    plan && !plan.isSynthetic && plan.quote ? plan : null;
  const durations = Object.fromEntries(Object.entries(catalogue.durations).map(([bucket, slot]) => [
    bucket, {
      ...slot,
      recommended: keep(slot.recommended),
      cheaper: keep(slot.cheaper),
      premium: keep(slot.premium),
      browseAll: slot.browseAll.filter(plan => keep(plan) !== null),
    },
  ]));
  const availableDurations = ORDER.filter(bucket => {
    const slot = durations[bucket];
    return slot && (slot.recommended || slot.cheaper || slot.premium || slot.browseAll.length);
  });
  return {
    ...catalogue,
    durations,
    availableDurations,
    defaultDuration: availableDurations.includes("DAY_3") ? "DAY_3" : availableDurations[0] ?? "",
  } as T;
}
