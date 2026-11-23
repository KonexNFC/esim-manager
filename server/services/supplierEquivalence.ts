import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../storage";
import { providerOffers, supplierEquivalenceVersions } from "@shared/schema";
import {
  canonicalServiceTerms,
  type EquivalenceApproval,
  type EquivalenceMember,
} from "../../shared/serviceEquivalence";
import { canonicalProviderKey } from "./providerHealth";

export type EquivalenceOffer = {
  id: string;
  providerKey: string;
  providerPlanCode: string;
  serviceTerms?: unknown;
};
export type EquivalenceBinding = { e?: string; o?: string };
export type BoundSku = EquivalenceBinding & { k: string; c: string };
export type ApprovalVersion = { id: string; approval: EquivalenceApproval };

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function termsHash(value: unknown): string {
  return hash(canonicalServiceTerms(value));
}

export function canonicalApproval(value: EquivalenceApproval): EquivalenceApproval {
  if (!value.group?.trim() || !Number.isInteger(value.version) || value.version < 1 ||
      !value.approvedBy?.trim() || !value.evidence?.trim() || value.members.length < 2) {
    throw new Error("Equivalence requires a version, reviewer, evidence and at least two exact SKUs");
  }
  const terms = canonicalServiceTerms(value.terms);
  const expected = termsHash(terms);
  const members = value.members.map(m => {
    if (!m.offerId || !m.providerPlanCode || !m.providerKey || m.termsHash !== expected) {
      throw new Error("Every approved SKU must have identical verified service terms");
    }
    return {
      offerId: m.offerId, providerKey: canonicalProviderKey(m.providerKey),
      providerPlanCode: m.providerPlanCode, termsHash: m.termsHash,
    };
  }).sort((a, b) => a.offerId.localeCompare(b.offerId));
  if (new Set(members.map(m => m.offerId)).size !== members.length ||
      new Set(members.map(m => m.providerKey)).size !== members.length) {
    throw new Error("Equivalence members must use distinct offers and suppliers");
  }
  return {
    group: value.group, version: value.version, approvedBy: value.approvedBy,
    evidence: value.evidence, terms, members,
  };
}

export function approvalId(approval: EquivalenceApproval): string {
  return hash(canonicalApproval(approval));
}

function matches(offer: EquivalenceOffer, member: EquivalenceMember): boolean {
  try {
    return offer.id === member.offerId &&
      canonicalProviderKey(offer.providerKey) === member.providerKey &&
      offer.providerPlanCode === member.providerPlanCode &&
      termsHash(offer.serviceTerms) === member.termsHash;
  } catch { return false; }
}

export function approvedMembers(
  version: ApprovalVersion, selected: EquivalenceOffer, offers: EquivalenceOffer[],
): EquivalenceOffer[] {
  try {
    const approval = canonicalApproval(version.approval);
    if (approvalId(approval) !== version.id ||
        !approval.members.some(m => matches(selected, m))) return [];
    return offers.filter(offer => approval.members.some(m => matches(offer, m)));
  } catch { return []; }
}

/** No approval is inferred from normalized-plan membership. */
export async function findApprovedEquivalents<T extends EquivalenceOffer>(
  selected: T, offers: T[],
): Promise<{ offers: T[]; equivalenceId?: string }> {
  // Existing catalogues without complete supplier terms remain pinned.
  try { canonicalServiceTerms(selected.serviceTerms); }
  catch { return { offers: [selected] }; }
  const versions = await db.select().from(supplierEquivalenceVersions);
  versions.sort((a, b) => b.version - a.version || a.id.localeCompare(b.id));
  for (const version of versions) {
    const ids = new Set(approvedMembers(version, selected, offers).map(o => o.id));
    if (ids.size > 1) {
      return {
        offers: [selected, ...offers.filter(o => o.id !== selected.id && ids.has(o.id))],
        equivalenceId: version.id,
      };
    }
  }
  return { offers: [selected] };
}

export function assertBoundEquivalent(
  primary: BoundSku, entry: BoundSku, live: EquivalenceOffer, version?: ApprovalVersion,
): void {
  if (!primary.e || primary.e !== entry.e || !entry.o || live.id !== entry.o ||
      canonicalProviderKey(live.providerKey) !== canonicalProviderKey(entry.k) ||
      live.providerPlanCode !== entry.c || !version || version.id !== entry.e) {
    throw new Error("Supplier SKU lacks the paid equivalence approval");
  }
  const approval = canonicalApproval(version.approval);
  if (approvalId(approval) !== version.id ||
      !approval.members.some(m => m.offerId === primary.o &&
        m.providerKey === canonicalProviderKey(primary.k) && m.providerPlanCode === primary.c) ||
      !approval.members.some(m => matches(live, m))) {
    throw new Error("Supplier service terms or equivalence approval changed");
  }
}

export async function validateBoundEquivalent(primary: BoundSku, entry: BoundSku, live: EquivalenceOffer): Promise<void> {
  const [version] = entry.e
    ? await db.select().from(supplierEquivalenceVersions).where(eq(supplierEquivalenceVersions.id, entry.e))
    : [];
  assertBoundEquivalent(primary, entry, live, version);
}

/** Trusted operations entry point; never exposed as a public checkout API. */
export async function approveEquivalence(input: EquivalenceApproval): Promise<string> {
  const approval = canonicalApproval(input);
  for (const member of approval.members) {
    const [live] = await db.select().from(providerOffers).where(eq(providerOffers.id, member.offerId));
    if (!live?.isActive || !matches(live, member)) {
      throw new Error(`Cannot approve missing, inactive or changed SKU ${member.offerId}`);
    }
  }
  const id = approvalId(approval);
  await db.insert(supplierEquivalenceVersions).values({
    id, groupKey: approval.group, version: approval.version, approval,
  }); // Deliberately no upsert/update: a version is immutable.
  return id;
}
