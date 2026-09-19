import { getAuthenticatedUser } from "@/lib/credits/server";
import { getCreditPack } from "@/lib/razorpay/config";
import { getRazorpayClient } from "@/lib/razorpay/server";

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: "Please sign in before buying credits." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const pack = getCreditPack(body?.productId);
    if (!pack) {
      return Response.json({ error: "That credit pack is not available." }, { status: 400 });
    }

    const { keyId, client } = getRazorpayClient();
    const order = await client.orders.create({
      amount: pack.amountRupees * 100,
      currency: "INR",
      receipt: `listingai_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        product_id: pack.id,
        user_id: user.id,
        credits: String(pack.credits),
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
