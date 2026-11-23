/** Only use when the adapter can prove no purchase was accepted. */
export class PurchaseRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseRejectedError";
  }
}

/** Accepted or uncertain: never retry a purchase or move to another supplier. */
export class PurchasePendingError extends Error {
  constructor(
    readonly providerKey: string,
    message: string,
    readonly providerOrderId?: string,
  ) {
    super(message);
    this.name = "PurchasePendingError";
  }
}

export async function purchaseWithOutcomeGuard<T>(
  providerKey: string, purchase: () => Promise<T>,
): Promise<T> {
  try { return await purchase(); }
  catch (error) {
    if (error instanceof PurchaseRejectedError || error instanceof PurchasePendingError) throw error;
    throw new PurchasePendingError(providerKey,
      `Purchase outcome requires reconciliation: ${error instanceof Error ? error.message : String(error)}`);
  }
}
