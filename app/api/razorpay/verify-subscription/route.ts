import crypto from "node:crypto";
import { getAuthenticatedUser } from "@/lib/credits/server";
import { getRazorpayClient } from "@/lib/razorpay/server";
import { getSubscriptionPlan } from "@/lib/razorpay/subscriptions";

function isValidSubscriptionSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string
) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${subscriptionId}|${paymentId}`)
    .digest("hex");

  return expected.length === signature.length && crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in to verify the subscription." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const subscriptionId = typeof body?.razorpay_subscription_id === "string"
      ? body.razorpay_subscription_id
      : "";
    const paymentId = typeof body?.razorpay_payment_id === "string"
      ? body.razorpay_payment_id
      : "";
    const signature = typeof body?.razorpay_signature === "string"
      ? body.razorpay_signature
      : "";

    if (
      !subscriptionId ||
      !paymentId ||
      !signature ||
      !isValidSubscriptionSignature(subscriptionId, paymentId, signature)
    ) {
      return Response.json({ error: "Invalid subscription signature." }, { status: 400 });
    }

    const { client } = getRazorpayClient();
    const subscription = await client.subscriptions.fetch(subscriptionId);
    const payment = await client.payments.fetch(paymentId);
    const planId = subscription.notes?.product_id;
    const plan = getSubscriptionPlan(planId);
    const razorpayPlan = await client.plans.fetch(subscription.plan_id);

    if (
      !plan ||
      subscription.notes?.user_id !== user.id ||
      subscription.plan_id !== razorpayPlan.id ||
      razorpayPlan.item.currency !== "INR" ||
      razorpayPlan.item.amount !== plan.amountRupees * 100 ||
      payment.status !== "captured" ||
      payment.amount !== plan.amountRupees * 100
    ) {
      return Response.json({ error: "Subscription details could not be verified." }, { status: 400 });
    }

    const result = await supabase.rpc("record_verified_subscription", {
      purchase_subscription_id: subscriptionId,
      purchase_payment_id: paymentId,
      purchase_plan_id: plan.id,
      purchase_amount_paise: payment.amount,
    });

    if (result.error || !result.data?.ok) {
      return Response.json({ error: "Subscription verification could not be completed." }, { status: 409 });
    }

    return Response.json({
      success: true,
      duplicate: result.data.duplicate === true,
      plan: result.data.plan,
      credits: result.data.credits,
    });
  } catch (error) {
    console.error("Razorpay subscription verification failed:", error);
    return Response.json(
      { error: "Unable to verify the subscription right now. Please try again." },
      { status: 500 }
    );
  }
}
