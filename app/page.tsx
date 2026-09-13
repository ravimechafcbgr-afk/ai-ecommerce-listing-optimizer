"use client";

import { useState } from "react";

export default function Home() {
  const [productName, setProductName] = useState("");
  const [features, setFeatures] = useState("");
  const [category, setCategory] = useState("");
  const [marketplace, setMarketplace] = useState("Amazon");
  const [generated, setGenerated] = useState(false);

  function generateListing() {
    if (!productName.trim()) {
      alert("Please enter a product name.");
      return;
    }

    setGenerated(true);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <div className="text-xl font-bold tracking-tight">
              Listing<span className="text-blue-400">AI</span>
            </div>
            <div className="text-xs text-slate-400">
              Ecommerce Listing Optimizer
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            AI-powered
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 text-center">
        <div className="mx-auto mb-5 inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-sm text-blue-300">
          ✨ Create better product listings with AI
        </div>

        <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
          Turn your product into a{" "}
          <span className="text-blue-400">high-converting listing.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">
          Enter your product details and let AI create professional titles,
          bullet points, descriptions and keywords in seconds.
        </p>
      </section>

      {/* Main Tool */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Product information</h2>
              <p className="mt-1 text-sm text-slate-400">
                Tell us about the product you want to sell.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Product name
                </label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Rechargeable LED Desk Lamp"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Category
                </label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Home & Office"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Key features
                </label>
                <textarea
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  rows={5}
                  placeholder={
                    "Rechargeable\nTouch control\n3 brightness modes\nUSB charging"
                  }
                  className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Marketplace
                </label>
                <select
                  value={marketplace}
                  onChange={(e) => setMarketplace(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-400"
                >
                  <option>Amazon</option>
                  <option>Shopify</option>
                  <option>Etsy</option>
                  <option>eBay</option>
                </select>
              </div>

              <button
                onClick={generateListing}
                className="w-full rounded-xl bg-blue-500 px-5 py-4 font-semibold text-white transition hover:bg-blue-400"
              >
                ✨ Generate Listing
              </button>
            </div>
          </div>

          {/* Result Card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            {!generated ? (
              <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl">
                  ✨
                </div>

                <h2 className="text-xl font-semibold">
                  Your listing will appear here
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  Enter your product information and click Generate Listing to
                  create your optimized ecommerce content.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Your listing</h2>
                    <p className="text-sm text-slate-400">
                      Generated for {marketplace}
                    </p>
                  </div>

                  <div className="rounded-full bg-green-400/10 px-3 py-1 text-sm text-green-400">
                    87/100
                  </div>
                </div>

                <div className="space-y-5">
                  <ResultBlock
                    title="Product Title"
                    text={`${productName} - Premium Quality ${category || "Everyday Use"} Product`}
                  />

                  <ResultBlock
                    title="Bullet Points"
                    text={
                      features ||
                      "Premium quality • Easy to use • Reliable design • Great for everyday use"
                    }
                  />

                  <ResultBlock
                    title="Product Description"
                    text={`Discover the ${productName}. Designed with quality, convenience and everyday usability in mind. A practical choice for customers looking for a reliable ${category || "product"}.`}
                  />

                  <ResultBlock
                    title="SEO Keywords"
                    text={`${productName.toLowerCase()}, premium ${category.toLowerCase() || "product"}, best ${category.toLowerCase() || "product"}, online shopping`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/10 bg-slate-900/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            <Feature
              icon="⚡"
              title="Save time"
              text="Create professional ecommerce content in seconds."
            />
            <Feature
              icon="🎯"
              title="Better listings"
              text="Focus on benefits, clarity and conversion."
            />
            <Feature
              icon="🌎"
              title="Sell globally"
              text="Create content for marketplaces around the world."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-slate-500">
        ListingAI — Ecommerce Listing Optimizer
      </footer>
    </main>
  );
}

function ResultBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>

        <button className="text-xs text-blue-400 hover:text-blue-300">
          Copy
        </button>
      </div>

      <p className="whitespace-pre-line text-sm leading-6 text-slate-400">
        {text}
      </p>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 text-2xl">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}