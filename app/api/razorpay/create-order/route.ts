import { getAuthenticatedUser } from "@/lib/credits/server";
import { getCreditPack, getOneTimePlan } from "@/lib/razorpay/config";
import { getRazorpayClient } from "@/lib/razorpay/server";

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in before buying credits." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const plan = getOneTimePlan(body?.planId);
    const pack = getCreditPack(body?.productId);
    if (!plan && !pack) {
      return Response.json({ error: "That payment product is not available." }, { status: 400 });
    }

    const productId = plan?.id ?? pack?.id;
    const amountRupees = plan?.amountRupees ?? pack?.amountRupees;
    const credits = plan?.credits ?? pack?.credits;

    const { keyId, client } = getRazorpayClient();
    const order = await client.orders.create({
      amount: amountRupees! * 100,
      currency: "INR",
      receipt: `listingai_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        product_id: productId!,
        user_id: user.id,
        credits: String(credits),
      },
    });

    return Response.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    return Response.json(
      { error: "Unable to start the payment right now. Please try again." },
      { status: 500 }
    );
  }
}
