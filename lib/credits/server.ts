import { createSupabaseServerClient } from "@/lib/supabase/server";

type CreditResult = {
  credits: number;
};

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { supabase, user: null };
  }

  return { supabase, user: data.user };
}

export async function reserveCredits(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  cost: number,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<CreditResult | null> {
  const { data, error } = await supabase.rpc("consume_user_credits", {
    credit_cost: cost,
    credit_reason: reason,
    credit_metadata: metadata,
  });

  if (error || typeof data !== "number" || data < 0) {
    return null;
  }

  return { credits: data };
}

export async function refundCredits(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.rpc("refund_user_credits", {
    credit_amount: amount,
    credit_reason: reason,
    credit_metadata: metadata,
  });
}
