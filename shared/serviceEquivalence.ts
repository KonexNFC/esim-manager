import { z } from "zod";

// Unknown is not equivalent to "none". Every material term must be explicit.
export const serviceTermsSchema = z.object({
  coverage: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  allowance: z.object({
    kind: z.enum(["total", "daily", "unlimited"]),
    megabytes: z.number().int().positive().nullable(),
  }).strict(),
  validityHours: z.number().int().positive(),
  throttling: z.object({
    thresholdMb: z.number().int().positive().nullable(),
    speedKbps: z.number().int().positive().nullable(),
    reset: z.enum(["none", "daily", "never"]),
  }).strict(),
  activation: z.object({
    startsOn: z.enum(["purchase", "installation", "first_connection"]),
    activationWindowHours: z.number().int().positive().nullable(),
    topup: z.boolean(),
    tethering: z.boolean(),
  }).strict(),
}).strict().superRefine((terms, ctx) => {
  if ((terms.allowance.kind === "unlimited") !== (terms.allowance.megabytes === null)) {
    ctx.addIssue({ code: "custom", message: "Unlimited allowance alone must use null megabytes" });
  }
  if ((terms.throttling.thresholdMb === null) !== (terms.throttling.speedKbps === null) ||
      (terms.throttling.thresholdMb === null) !== (terms.throttling.reset === "none")) {
    ctx.addIssue({ code: "custom", message: "Specify both throttling threshold and speed, or explicitly none" });
  }
});

export type ServiceTerms = z.infer<typeof serviceTermsSchema>;

export function canonicalServiceTerms(value: unknown): ServiceTerms {
  const terms = serviceTermsSchema.parse(value);
  return { ...terms, coverage: [...new Set(terms.coverage)].sort() };
}

export type EquivalenceMember = {
  offerId: string;
  providerKey: string;
  providerPlanCode: string;
  termsHash: string;
};

export type EquivalenceApproval = {
  group: string;
  version: number;
  approvedBy: string;
  evidence: string;
  terms: ServiceTerms;
  members: EquivalenceMember[];
};
