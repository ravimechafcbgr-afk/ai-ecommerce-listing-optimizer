export type CreditPackId = "credits_30" | "credits_100" | "credits_250";

export type CreditPack = {
  id: CreditPackId;
  amountRupees: number;
  credits: number;
};

export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  credits_30: { id: "credits_30", amountRupees: 199, credits: 30 },
  credits_100: { id: "credits_100", amountRupees: 499, credits: 100 },
  credits_250: { id: "credits_250", amountRupees: 999, credits: 250 },
};

export function getCreditPack(productId: unknown) {
  if (typeof productId !== "string") {
    return null;
  }

  return CREDIT_PACKS[productId as CreditPackId] ?? null;
}

export type PlanId = "starter" | "pro";

export type OneTimePlan = {
  id: PlanId;
  name: string;
  amountRupees: number;
  credits: number;
};

export const ONE_TIME_PLANS: Record<PlanId, OneTimePlan> = {
  starter: { id: "starter", name: "Starter", amountRupees: 299, credits: 50 },
  pro: { id: "pro", name: "Pro", amountRupees: 699, credits: 200 },
};

export function getOneTimePlan(planId: unknown) {
  if (typeof planId !== "string") {
    return null;
  }

  return ONE_TIME_PLANS[planId as PlanId] ?? null;
}
