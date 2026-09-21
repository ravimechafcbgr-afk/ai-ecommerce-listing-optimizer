export type SubscriptionPlanId = "starter" | "pro";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  amountRupees: number;
  credits: number;
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  starter: { id: "starter", name: "Starter", amountRupees: 299, credits: 50 },
  pro: { id: "pro", name: "Pro", amountRupees: 699, credits: 200 },
};

export function getSubscriptionPlan(planId: unknown) {
  if (typeof planId !== "string") {
    return null;
  }

  return SUBSCRIPTION_PLANS[planId as SubscriptionPlanId] ?? null;
}
