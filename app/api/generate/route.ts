import { getAuthenticatedUser, refundCredits, reserveCredits } from "@/lib/credits/server";

export type ListingResponse = {
  title: string;
  bullets: string[];
  description: string;
  keywords: string;
  score: number;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiErrorBody = {
  error?: {
    status?: string;
    message?: string;
  };
};

class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

function isTemporaryGeminiError(statusCode: number, status?: string) {
  return statusCode === 503 || status === "UNAVAILABLE";
}

function getGeminiErrorMessage(statusCode: number, status?: string) {
  if (isTemporaryGeminiError(statusCode, status)) {
    return "Gemini is temporarily unavailable. Please try again in a moment.";
  }

  if (statusCode === 401 || status === "UNAUTHENTICATED") {
    return "Gemini authentication failed. Please check the server API configuration.";
  }

  if (statusCode === 400 || status === "INVALID_ARGUMENT") {
    return "Gemini could not process this request. Please check the product details or image and try again.";
  }

  if (statusCode === 413) {
    return "The request is too large. Please use a smaller image or less text.";
  }

  return "Gemini could not generate the listing right now. Please try again later.";
}

async function requestGemini(
  apiKey: string,
  contentParts: Array<Record<string, unknown>>
): Promise<GeminiResponse> {
  const retryDelays = [300, 700];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: contentParts,
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    });

    if (response.ok) {
      return (await response.json()) as GeminiResponse;
    }

    const errorBody = (await response.json().catch(() => null)) as GeminiErrorBody | null;
    const errorStatus = errorBody?.error?.status;
    const shouldRetry = isTemporaryGeminiError(response.status, errorStatus);

    if (shouldRetry && attempt < retryDelays.length) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      continue;
    }

    throw new GeminiRequestError(
      getGeminiErrorMessage(response.status, errorStatus),
      shouldRetry ? 503 : response.status
    );
  }

  throw new GeminiRequestError(
    "Gemini could not generate the listing right now. Please try again later.",
    503
  );
}

function normalizeText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function cleanBullets(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: unknown) => normalizeText(item, ""))
    .map((item: string) => item.replace(/^[\-•\s]+/, "").trim())
    .filter((item: string) => Boolean(item))
    .slice(0, 5);
}

function extractJsonContent(content: string | null | undefined) {
  if (!content) {
    return null;
  }

  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/```json\s*(\{[\s\S]*?\})\s*```/i);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    return braceMatch[0];
  }

  return trimmed;
}

function calculateScore({
  title,
  bullets,
  description,
  keywords,
}: {
  title: string;
  bullets: string[];
  description: string;
  keywords: string;
}) {
  let score = 45;

  if (title.trim().length >= 30 && title.trim().length <= 160) {
    score += 12;
  }

  if (bullets.length === 5) {
    score += 15;
  }

  if (description.trim().length >= 160) {
    score += 15;
  }

  if (keywords.trim().length >= 50) {
    score += 10;
  }

  if (
    title.toLowerCase().includes("best") ||
    title.toLowerCase().includes("premium")
  ) {
    score += 5;
  }

  if (bullets.every((bullet) => bullet.length >= 25)) {
    score += 8;
  }

  return Math.min(score, 98);
}

export async function POST(request: Request) {
  let refund: (() => Promise<void>) | null = null;

  try {
    const body = await request.json();
    const productName = normalizeText(body?.productName, "");
    const category = normalizeText(body?.category, "General");
    const marketplace = normalizeText(body?.marketplace, "Amazon");
    const featureInput = typeof body?.features === "string" ? body.features : "";
    const image = body?.image;

    if (!productName) {
      return Response.json(
        { error: "Please enter a product name." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Gemini API key is missing." },
        { status: 500 }
      );
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { error: "Please sign in to generate a listing." },
        { status: 401 }
      );
    }

    const creditCost = image ? 2 : 1;
    const creditReservation = await reserveCredits(
      supabase,
      creditCost,
      image ? "generate_listing_with_image" : "generate_listing",
      { productName, marketplace }
    );

    if (!creditReservation) {
      return Response.json(
        { error: `You need ${creditCost} credit${creditCost === 1 ? "" : "s"} to generate this listing.` },
        { status: 402 }
      );
    }

    refund = () =>
      refundCredits(supabase, creditCost, "refund_failed_listing_generation", {
        productName,
        marketplace,
      });

    const features = featureInput
      .split(/\n+/)
      .map((item: string) => item.trim())
      .filter((item: string) => Boolean(item))
      .slice(0, 8);

    if (image !== null && image !== undefined) {
      if (
        typeof image !== "object" ||
        typeof image.data !== "string" ||
        typeof image.mimeType !== "string"
      ) {
        return Response.json(
          { error: "The uploaded image could not be processed." },
          { status: 400 }
        );
      }

      if (!ACCEPTED_IMAGE_TYPES.has(image.mimeType)) {
        return Response.json(
          { error: "Please upload a JPG, JPEG, PNG or WEBP image." },
          { status: 400 }
        );
      }

      const imageSize = Math.ceil((image.data.length * 3) / 4);
      if (imageSize > MAX_IMAGE_SIZE) {
        return Response.json(
          { error: "Please upload an image smaller than 5 MB." },
          { status: 400 }
        );
      }
    }

    const prompt = `You are an expert ecommerce copywriter. Create a high-converting product listing for ${marketplace}. Use the following product details:
- Product name: ${productName}
- Category: ${category}
- Key features: ${features.length > 0 ? features.join("; ") : "Premium quality, reliable performance, modern design, everyday convenience"}

${image ? `Analyze the product image and use only visible, defensible details. Identify the visible product type, major visible features, colors, design/style, likely use case, and useful listing details visible in the image. Do not invent specifications that are not visible.` : "No product image was provided; rely on the written product details."}

Return valid JSON only with this exact structure:
{
  "title": "SEO optimized product title",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "description": "professional product description",
  "keywords": "comma-separated SEO keywords"
}

Rules:
- Title should be SEO-friendly and marketplace-appropriate.
- Include exactly 5 bullet points.
- Description should be persuasive, professional, and 120-220 words.
- Keywords should be a single comma-separated string with 8-20 keywords.
- Keep content natural, conversion-focused, and relevant to the product and marketplace.`;

    const contentParts: Array<Record<string, unknown>> = [
      { text: prompt },
    ];

    if (image) {
      contentParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data,
        },
      });
    }

    const geminiData = await requestGemini(apiKey, contentParts);

    const rawContent =
      geminiData.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? null;

    const parsedJson = extractJsonContent(rawContent);

    if (!parsedJson) {
      throw new Error("Gemini returned an empty response.");
    }

    const payload = JSON.parse(parsedJson) as {
      title?: unknown;
      bullets?: unknown;
      description?: unknown;
      keywords?: unknown;
    };

    const title = normalizeText(payload.title, `${productName} - ${category}`);
    const bullets = cleanBullets(payload.bullets);
    const description = normalizeText(
      payload.description,
      `Discover the ${productName}, a high-quality ${category} designed to deliver dependable performance and everyday convenience.`
    );
    const keywords = normalizeText(
      payload.keywords,
      `${productName.toLowerCase()}, ${category.toLowerCase()}, ${features.join(", ") || "premium quality"}`
    );

    const finalBullets =
      bullets.length === 5
        ? bullets
        : [
            features[0] || "Premium quality",
            features[1] || "Reliable performance",
            features[2] || "Easy to use",
            features[3] || "Built for everyday convenience",
            features[4] || "Designed for lasting value",
          ].map((feature, index) => {
            const base = feature.trim();
            return `${base}${
              index < 2
                ? " for everyday use"
                : index === 2
                  ? " with a practical and user-friendly design"
                  : index === 3
                    ? " to improve convenience and efficiency"
                    : " to deliver dependable value"
            }.`;
          });

    const listing: ListingResponse = {
      title,
      bullets: finalBullets,
      description,
      keywords,
      score: calculateScore({
        title,
        bullets: finalBullets,
        description,
        keywords,
      }),
    };

    refund = null;
    return Response.json(listing);
  } catch (error) {
    if (refund) {
      await refund();
    }

    console.error(
      "Listing generation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    const statusCode =
      error instanceof GeminiRequestError ? error.statusCode : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate the listing right now. Please try again.";

    return Response.json({ error: message }, { status: statusCode });
  }
}
