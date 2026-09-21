import { getAuthenticatedUser } from "@/lib/credits/server";
import { getRazorpayClient } from "@/lib/razorpay/server";
import { getSubscriptionPlan } from "@/lib/razorpay/subscriptions";

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in before upgrading." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const plan = getSubscriptionPlan(body?.planId);
    if (!plan) {
      return Response.json({ error: "That subscription plan is not available." }, { status: 400 });
    }

    const { keyId, client } = getRazorpayClient();
    const razorpayPlan = await client.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: `ListingAI ${plan.name}`,
        amount: plan.amountRupees * 100,
        currency: "INR",
        description: `${plan.name} monthly plan`,
      },
      notes: {
        product_id: plan.id,
      },
    });

    const subscription = await client.subscriptions.create({
      plan_id: razorpayPlan.id,
      total_count: 12,
      customer_notify: 1,
      notes: {
        product_id: plan.id,
        user_id: user.id,
      },
    });

    return Response.json({
      subscriptionId: subscription.id,
      planId: plan.id,
      keyId,
    });
  } catch (error) {
    console.error("Razorpay subscription creation failed:", error);
    return Response.json(
      { error: "Unable to start the subscription right now. Please try again." },
      { status: 500 }
    );
  }
}
