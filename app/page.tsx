"use client";

import { useState } from "react";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Listing = {
  title: string;
  bullets: string[];
  description: string;
  keywords: string;
  score: number;
};

export default function Home() {
  const [productName, setProductName] = useState("");
  const [features, setFeatures] = useState("");
  const [category, setCategory] = useState("");
  const [marketplace, setMarketplace] = useState("Amazon");
  const [generated, setGenerated] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);

  function handleImageChange(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Please upload a JPG, JPEG, PNG or WEBP image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("Please upload an image smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Unable to read that image. Please try another file.");
        return;
      }

      setImagePreview(reader.result);
      setImageData(reader.result.split(",")[1] || null);
      setImageMimeType(file.type);
      setGenerated(null);
      setError(null);
    };
    reader.onerror = () => {
      setError("Unable to read that image. Please try another file.");
    };
    reader.readAsDataURL(file);
  }

  async function generateListing() {
    if (!productName.trim()) {
      alert("Please enter a product name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productName: productName.trim(),
          category: category.trim() || "General",
          features,
          marketplace,
          image: imageData
            ? { data: imageData, mimeType: imageMimeType }
            : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to generate the listing right now.");
      }

      setGenerated({
        title: data.title || "",
        bullets: Array.isArray(data.bullets) ? data.bullets : [],
        description: data.description || "",
        keywords: data.keywords || "",
        score: typeof data.score === "number" ? data.score : 0,
      });
    } catch (err) {
      setGenerated(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate the listing right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
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
          <span className="text-blue-400">
            high-converting listing.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">
          Enter your product details and let ListingAI create professional
          titles, bullet points, descriptions and SEO keywords in seconds.
        </p>
      </section>

      {/* Main Tool */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                Product information
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Tell us about the product you want to sell.
              </p>
            </div>

            <div className="space-y-5">
              {/* Product Name */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Product name
                </label>

                <input
                  value={productName}
                  onChange={(e) => {
                    setProductName(e.target.value);
                    setGenerated(null);
                    setError(null);
                  }}
                  placeholder="e.g. Wireless Bluetooth Speaker"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                />
              </div>

              {/* Category */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Category
                </label>

                <input
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setGenerated(null);
                    setError(null);
                  }}
                  placeholder="e.g. Electronics"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                />
              </div>

              {/* Features */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Key features
                </label>

                <textarea
                  value={features}
                  onChange={(e) => {
                    setFeatures(e.target.value);
                    setGenerated(null);
                    setError(null);
                  }}
                  rows={6}
                  placeholder={
                    "20W powerful sound\nRGB lights\n12-hour battery\nType-C charging\nPortable design"
                  }
                  className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-400"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Add one feature per line for better results.
                </p>
              </div>

              {/* Product Image */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Product image <span className="text-slate-500">(optional)</span>
                </label>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-slate-900 px-4 py-5 text-center transition hover:border-blue-400/60">
                  <span className="text-sm font-medium text-slate-300">
                    {imagePreview ? "Choose a different image" : "Upload product image"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    JPG, PNG or WEBP up to 5 MB
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => handleImageChange(e.target.files?.[0])}
                  />
                </label>

                {imagePreview ? (
                  <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                    <img
                      src={imagePreview}
                      alt="Selected product"
                      className="max-h-48 w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>

              {/* Marketplace */}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Marketplace
                </label>

                <select
                  value={marketplace}
                  onChange={(e) => {
                    setMarketplace(e.target.value);
                    setGenerated(null);
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-400"
                >
                  <option>Amazon</option>
                  <option>Shopify</option>
                  <option>Etsy</option>
                  <option>eBay</option>
                </select>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              {/* Generate */}
              <button
                onClick={generateListing}
                disabled={loading}
                className="w-full rounded-xl bg-blue-500 px-5 py-4 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "✨ Creating Listing..." : "✨ Generate Listing"}
              </button>
            </div>
          </div>

          {/* Result Card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            {!generated ? (
              <div className="flex min-h-[600px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-3xl">
                  ✨
                </div>

                <h2 className="text-xl font-semibold">
                  Your listing will appear here
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  Enter your product information and click Generate Listing
                  to create optimized ecommerce content.
                </p>
              </div>
            ) : (
              <div>
                {/* Result Header */}
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Your listing
                    </h2>

                    <p className="text-sm text-slate-400">
                      Optimized for {marketplace}
                    </p>
                  </div>

                  <div className="rounded-full bg-green-400/10 px-3 py-1 text-sm font-semibold text-green-400">
                    {generated.score}/100
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Title */}
                  <ResultBlock
                    title="Product Title"
                    text={generated.title}
                  />

                  {/* Bullets */}
                  <ResultBlock
                    title="Bullet Points"
                    text={generated.bullets
                      .map((bullet) => `• ${bullet}`)
                      .join("\n")}
                  />

                  {/* Description */}
                  <ResultBlock
                    title="Product Description"
                    text={generated.description}
                  />

                  {/* Keywords */}
                  <ResultBlock
                    title="SEO Keywords"
                    text={generated.keywords}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Benefits */}
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
              text="Create marketplace-ready content for customers around the world."
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

/* -------------------------------- */
/* Result Block                     */
/* -------------------------------- */

function ResultBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Unable to copy. Please select the text manually.");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-slate-200">
          {title}
        </h3>

        <button
          onClick={copyText}
          className="text-xs font-medium text-blue-400 transition hover:text-blue-300"
        >
          Copy
        </button>
      </div>

      <p className="whitespace-pre-line text-sm leading-6 text-slate-400">
        {text}
      </p>
    </div>
  );
}

/* -------------------------------- */
/* Feature Card                     */
/* -------------------------------- */

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

      <p className="mt-2 text-sm leading-6 text-slate-400">
        {text}
      </p>
    </div>
  );
}