export type ListingResponse = {
  title: string;
  bullets: string[];
  description: string;
  keywords: string;
  score: number;
};

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
  try {
    const body = await request.json();
    const productName = normalizeText(body?.productName, "");
    const category = normalizeText(body?.category, "General");
    const marketplace = normalizeText(body?.marketplace, "Amazon");
    const featureInput = typeof body?.features === "string" ? body.features : "";

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

    const features = featureInput
      .split(/\n+/)
      .map((item: string) => item.trim())
      .filter((item: string) => Boolean(item))
      .slice(0, 8);

    const prompt = `You are an expert ecommerce copywriter. Create a high-converting product listing for ${marketplace}. Use the following product details:
- Product name: ${productName}
- Category: ${category}
- Key features: ${features.length > 0 ? features.join("; ") : "Premium quality, reliable performance, modern design, everyday convenience"}

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

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        errorText || "Gemini API request failed. Please try again later."
      );
    }

    const geminiData = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

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

    return Response.json(listing);
  } catch (error) {
    console.error("Listing generation failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate the listing right now. Please try again.",
      },
      { status: 500 }
    );
  }
}
