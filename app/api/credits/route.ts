import { getAuthenticatedUser } from "@/lib/credits/server";

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return Response.json({ authenticated: false, credits: null });
  }

  const { error: profileError } = await supabase.rpc("ensure_user_profile");
  if (profileError) {
    return Response.json(
      { error: "Unable to initialize your credit balance right now." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return Response.json(
      { error: "Unable to load your credit balance right now." },
      { status: 500 }
    );
  }

  return Response.json({ authenticated: true, credits: data.credits });
}
