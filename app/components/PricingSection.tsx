"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { email?: string };
  theme?: { color?: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

type Plan = {
  name: string;
  price: string;
  cadence?: string;
  description: string;
  features: string[];
  action: string;
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: "₹0",
    description: "A simple way to explore ListingAI.",
    features: ["7 credits", "AI listing generation", "Basic image tools"],
    action: "Current plan",
  },
  {
    name: "Starter",
    price: "₹299",
    cadence: "/month",
    description: "More room for a steady listing workflow.",
    features: [
      "50 AI listing credits",
      "30 background removals",
      "30 image enhancements",
      "All supported marketplaces",
    ],
    action: "Upgrade to Starter",
  },
  {
    name: "Pro",
    price: "₹699",
    cadence: "/month",
    description: "Built for a higher-volume catalog workflow.",
    features: [
      "200 AI listing credits",
      "100 background removals",
      "100 image enhancements",
      "Advanced listing generation",
      "Priority processing",
    ],
    action: "Upgrade to Pro",
    highlighted: true,
  },
];

const creditPacks = [
  { id: "credits_30", price: "₹199", credits: "30 credits" },
  { id: "credits_100", price: "₹499", credits: "100 credits" },
  { id: "credits_250", price: "₹999", credits: "250 credits" },
];

export default function PricingSection() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePack, setActivePack] = useState<string | null>(null);

  function loadRazorpayScript() {
    return new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Razorpay Checkout could not load."));
      document.body.appendChild(script);
    });
  }

  async function buyCredits(productId: string, label: string) {
    if (activePack) {
      return;
    }

    setActivePack(productId);
    setMessage(null);
    setError(null);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        throw new Error("Please sign in before buying credits.");
      }

      const orderResponse = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const orderData = (await orderResponse.json()) as {
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        error?: string;
      };

      if (!orderResponse.ok || !orderData.orderId || !orderData.amount || !orderData.keyId) {
        throw new Error(orderData.error || "Unable to start the payment right now.");
      }

      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout is unavailable right now.");
      }

      const checkout = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "ListingAI",
        description: `${label} credit pack`,
        order_id: orderData.orderId,
        prefill: { email: data.session.user.email ?? undefined },
        theme: { color: "#3b82f6" },
        handler: (response) => {
          void verifyPayment(response);
        },
        modal: {
          ondismiss: () => setActivePack(null),
        },
      });

      checkout.open();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start the payment right now.");
      setActivePack(null);
    }
  }

  async function verifyPayment(response: RazorpayCheckoutResponse) {
    try {
      const verificationResponse = await fetch("/api/razorpay/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      const data = (await verificationResponse.json()) as { success?: boolean; error?: string };

      if (!verificationResponse.ok || !data.success) {
        throw new Error(data.error || "Payment verification failed.");
      }

      setMessage("Payment verified. Your credits have been added.");
      window.dispatchEvent(new Event("listingai:credits-updated"));
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Payment verification failed.");
    } finally {
      setActivePack(null);
    }
  }

  function showSubscriptionsComingSoon() {
    setError(null);
    setMessage("Subscriptions coming next.");
  }

  return (
    <section id="pricing" className="border-y border-white/10 bg-slate-900/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-300">
            Plans & credits
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Choose the pace that fits your catalog.
          </h2>
          <p className="mt-4 text-slate-400">
            Start free, then add capacity as your listing workflow grows.
          </p>
        </div>

        {message ? (
          <div
            role="status"
            className="mx-auto mt-8 max-w-md rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-center text-sm text-blue-200"
          >
            {message}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mx-auto mt-8 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 shadow-2xl ${
                plan.highlighted
                  ? "border-blue-400/70 bg-blue-500/[0.08] shadow-blue-950/40"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full border border-blue-400/40 bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-300">
                  For growing teams
                </span>
              ) : null}

              <div>
                <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">
                  {plan.description}
                </p>
              </div>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-white">{plan.price}</span>
                {plan.cadence ? <span className="text-sm text-slate-500">{plan.cadence}</span> : null}
              </div>

              <ul className="mt-7 flex-1 space-y-3 border-t border-white/10 pt-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-slate-300">
                    <span className="text-emerald-300" aria-hidden="true">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={plan.highlighted || plan.name === "Starter" ? showSubscriptionsComingSoon : undefined}
                disabled={plan.name === "Free"}
                className={`mt-8 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  plan.name === "Free"
                    ? "cursor-default border border-white/10 bg-white/5 text-slate-500"
                    : plan.highlighted
                      ? "bg-blue-500 text-white hover:bg-blue-400"
                      : "border border-blue-400/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                }`}
              >
                {plan.action}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-300">
                Credit packs
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Add credits when you need them.</h3>
              <p className="mt-2 text-sm text-slate-400">One-time packs for flexible usage.</p>
            </div>
            <span className="text-sm text-slate-500">No recurring commitment</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {creditPacks.map((pack) => (
              <div key={pack.price} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div>
                  <p className="text-lg font-semibold text-white">{pack.price}</p>
                  <p className="mt-1 text-sm text-slate-400">{pack.credits}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void buyCredits(pack.id, pack.credits)}
                  disabled={activePack !== null}
                  className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20"
                >
                  {activePack === pack.id ? "Opening..." : "Buy Credits"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
