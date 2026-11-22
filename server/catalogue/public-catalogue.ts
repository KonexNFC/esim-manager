import type {
  DestinationCatalogue,
  DurationSlot,
  NormalizedOffer,
} from "./supplier-plan.types";
import { purchasableCatalogue } from "../../shared/purchasable-catalogue";

type RoutedProvider = {
  providerKey: string;
  providerPlanCode: string;
};

type RoutingDecision = {
  fallbackChain: RoutedProvider[];
};

type EligibleProviderOffer = RoutedProvider & {
  id: string;
};

export type PublicCatalogueOffer = NormalizedOffer & {
  quote: Record<string, unknown>;
};

export type PublicCatalogueSlot = Omit<
  DurationSlot,
  "recommended" | "cheaper" | "premium" | "browseAll"
> & {
  recommended: PublicCatalogueOffer | null;
  cheaper: PublicCatalogueOffer | null;
  premium: PublicCatalogueOffer | null;
  browseAll: PublicCatalogueOffer[];
};

export type PublicCatalogueResponse = Omit<DestinationCatalogue, "durations"> & {
  durations: Record<string, PublicCatalogueSlot>;
};

export type PublicCatalogueQuoteDependencies = {
  selectBestProviderForPlan: (
    normalizedPlanId: string,
    strategy: "blended_score",
  ) => Promise<RoutingDecision>;
  getOffersForNormalizedPlan: (
    normalizedPlanId: string,
  ) => Promise<EligibleProviderOffer[]>;
  createCheckoutQuoteForOffer: (providerOfferId: string) => Promise<unknown>;
  toPublicCheckoutQuote: (quote: any) => Record<string, unknown>;
};

/**
 * Attach signed singleton quotes to the public catalogue.
 *
 * Catalogue recommendation roles are intentionally assigned before this step.
 * They choose which normalized product cards to show; routing then chooses the
 * concrete supplier SKU for each product. A normalized-plan match is not
 * supplier equivalence, so the selected SKU is resolved again by provider key
 * and plan code before its quote is issued. Its catalogue terms are copied to
 * the response so the displayed card and signed quote cannot diverge.
 */
export async function attachPublicCatalogueQuotes(
  catalogue: DestinationCatalogue,
  dependencies: PublicCatalogueQuoteDependencies,
): Promise<PublicCatalogueResponse> {
  const catalogueOffersById = new Map<string, NormalizedOffer>();
  for (const duration of Object.values(catalogue.durations)) {
    if (!duration) continue;
    for (const offer of [
      duration.recommended,
      duration.cheaper,
      duration.premium,
      ...duration.browseAll,
    ]) {
      if (offer) catalogueOffersById.set(offer.id, offer);
    }
  }

  // Several static supplier offers can represent the same normalized product.
  // Reuse one routing decision so one public request cannot expose different
  // supplier winners for the same normalized product.
  const routingByNormalizedPlan = new Map<
    string,
    Promise<EligibleProviderOffer | null>
  >();
  const quoteByOfferId = new Map<
    string,
    Promise<Record<string, unknown> | null>
  >();

  const routeConcreteOffer = (
    offer: NormalizedOffer | null,
  ): Promise<EligibleProviderOffer | null> => {
    if (!offer || offer.isSynthetic || !offer.normalizedPlanId) {
      return Promise.resolve(null);
    }

    const normalizedPlanId = offer.normalizedPlanId;
    let routed = routingByNormalizedPlan.get(normalizedPlanId);
    if (!routed) {
      routed = (async () => {
        const decision = await dependencies.selectBestProviderForPlan(
          normalizedPlanId,
          "blended_score",
        );
        const selected = decision.fallbackChain[0];
        if (!selected) return null;

        const eligible = await dependencies.getOffersForNormalizedPlan(
          normalizedPlanId,
        );
        return (
          eligible.find(
            candidate =>
              candidate.providerKey === selected.providerKey &&
              candidate.providerPlanCode === selected.providerPlanCode,
          ) ?? null
        );
      })().catch(() => null);
      routingByNormalizedPlan.set(normalizedPlanId, routed);
    }
    return routed;
  };

  const quoteOffer = async (
    offer: NormalizedOffer | null,
  ): Promise<PublicCatalogueOffer | null> => {
    if (!offer || offer.isSynthetic || !offer.normalizedPlanId) return null;
    try {
      const routedOffer = await routeConcreteOffer(offer);
      if (!routedOffer) return null;

      const routedCatalogueOffer = catalogueOffersById.get(routedOffer.id);
      // The routed provider offer must also be present in this public
      // catalogue. Otherwise its terms cannot be displayed safely.
      if (!routedCatalogueOffer) return null;

      let publicQuote = quoteByOfferId.get(routedOffer.id);
      if (!publicQuote) {
        publicQuote = (async () => {
          const quote = await dependencies.createCheckoutQuoteForOffer(
            routedOffer.id,
          );
          return dependencies.toPublicCheckoutQuote(quote);
        })().catch(() => null);
        quoteByOfferId.set(routedOffer.id, publicQuote);
      }
      const quote = await publicQuote;
      if (!quote) return null;

      return {
        ...routedCatalogueOffer,
        // Preserve the recommendation role selected by the static catalogue,
        // while replacing supplier-specific terms with the routed SKU's terms.
        recommendationRole: offer.recommendationRole,
        quote,
      };
    } catch {
      return null;
    }
  };

  const quotedDurations = await Promise.all(
    Object.entries(catalogue.durations).map(async ([bucket, slot]) => {
      if (!slot) return [bucket, slot] as const;

      const [recommended, cheaper, premium, browseAll] = await Promise.all([
        quoteOffer(slot.recommended),
        quoteOffer(slot.cheaper),
        quoteOffer(slot.premium),
        Promise.all(slot.browseAll.map(quoteOffer)),
      ]);

      // Routing may collapse two supplier representations of one normalized
      // product onto the same concrete SKU. Keep the highest-priority card and
      // never advertise duplicate IDs in a public slot.
      const usedIds = new Set<string>();
      const keepUnique = (candidate: PublicCatalogueOffer | null) => {
        if (!candidate || usedIds.has(candidate.id)) return null;
        usedIds.add(candidate.id);
        return candidate;
      };
      const uniqueRecommended = keepUnique(recommended);
      const uniqueCheaper = keepUnique(cheaper);
      const uniquePremium = keepUnique(premium);
      const uniqueBrowseAll: PublicCatalogueOffer[] = [];
      for (const candidate of browseAll) {
        if (!candidate || usedIds.has(candidate.id)) continue;
        usedIds.add(candidate.id);
        uniqueBrowseAll.push(candidate);
      }

      return [
        bucket,
        {
          ...slot,
          recommended: uniqueRecommended,
          cheaper: uniqueCheaper,
          premium: uniquePremium,
          browseAll: uniqueBrowseAll,
        },
      ] as const;
    }),
  );

  return purchasableCatalogue({
    ...catalogue,
    durations: Object.fromEntries(quotedDurations),
  });
}