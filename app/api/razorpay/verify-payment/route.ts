import crypto from "node:crypto";
import { getAuthenticatedUser } from "@/lib/credits/server";
import { getCreditPack } from "@/lib/razorpay/config";
import { getRazorpayClient } from "@/lib/razorpay/server";

function isValidSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
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
      return Response.json({ error: "Please sign in to verify the payment." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";

    if (!orderId || !paymentId || !signature || !isValidSignature(orderId, paymentId, signature)) {
      return Response.json({ error: "Invalid payment signature." }, { status: 400 });
    }

    const { client } = getRazorpayClient();
    const order = await client.orders.fetch(orderId);
    const payment = await client.payments.fetch(paymentId);
    const productId = order.notes?.product_id;
    const pack = getCreditPack(productId);

    if (
      !pack ||
      order.notes?.user_id !== user.id ||
      order.currency !== "INR" ||
      order.amount !== pack.amountRupees * 100 ||
      payment.order_id !== orderId ||
      payment.status !== "captured"
    ) {
      return Response.json({ error: "Payment details could not be verified." }, { status: 400 });
    }

    const result = await supabase.rpc("record_verified_credit_purchase", {
      purchase_order_id: orderId,
      purchase_payment_id: paymentId,
      purchase_product_id: pack.id,
      purchase_amount_paise: order.amount,
    });

    if (result.error || !result.data?.ok) {
      return Response.json({ error: "Payment verification could not be completed." }, { status: 409 });
    }

    return Response.json({
      success: true,
      duplicate: result.data.duplicate === true,
      credits: result.data.credits,
    });
  } catch (error) {
    console.error("Razorpay payment verification failed:", error);
    return Response.json(
      { error: "Unable to verify the payment right now. Please contact support if you were charged." },
      { status: 500 }
    );
  }
}
