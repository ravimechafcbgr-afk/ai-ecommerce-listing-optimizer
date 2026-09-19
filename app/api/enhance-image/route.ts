import sharp from "sharp";
import { NextRequest } from "next/server";
import { getAuthenticatedUser, refundCredits, reserveCredits } from "@/lib/credits/server";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function normalizeImageType(fileName: string | undefined, mimeType: string | null) {
  if (mimeType && ACCEPTED_IMAGE_TYPES.has(mimeType.toLowerCase())) {
    return mimeType.toLowerCase();
  }

  if (!fileName) {
    return null;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return null;
}

function dataUrlToBlob(dataUrl: string) {
  const match = /^data:(image\/[^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

async function resolveImageFile(formData: FormData) {
  const fileEntry = formData.get("image_file");
  const stringEntry = formData.get("image");

  if (typeof fileEntry === "object" && fileEntry !== null && "name" in fileEntry) {
    return fileEntry as File;
  }

  if (typeof fileEntry === "object" && fileEntry !== null && "type" in fileEntry) {
    return new File([fileEntry as BlobPart], "uploaded-image.png", {
      type: (fileEntry as Blob).type || "image/png",
    });
  }

  if (typeof fileEntry === "string" && fileEntry.startsWith("data:")) {
    return new File([dataUrlToBlob(fileEntry)], "uploaded-image.png", {
      type: "image/png",
    });
  }

  if (typeof stringEntry === "string" && stringEntry.startsWith("data:")) {
    return new File([dataUrlToBlob(stringEntry)], "uploaded-image.png", {
      type: "image/png",
    });
  }

  return null;
}

function sanitizeEnhancementError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to enhance the image right now.";
}

export async function POST(request: NextRequest) {
  let refund: (() => Promise<void>) | null = null;

  try {
    const formData = await request.formData();
    const imageFile = await resolveImageFile(formData);

    if (!imageFile) {
      return Response.json(
        { error: "Please upload a product image first." },
        { status: 400 }
      );
    }

    const mimeType = normalizeImageType(imageFile.name, imageFile.type);
    if (!mimeType) {
      return Response.json(
        { error: "Please upload a JPG, JPEG, PNG or WebP image." },
        { status: 400 }
      );
    }

    if (imageFile.size > MAX_IMAGE_SIZE) {
      return Response.json(
        { error: "Please upload an image smaller than 5 MB." },
        { status: 400 }
      );
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { error: "Please sign in to enhance the image." },
        { status: 401 }
      );
    }

    const creditReservation = await reserveCredits(
      supabase,
      2,
      "enhance_image",
      { fileName: imageFile.name }
    );

    if (!creditReservation) {
      return Response.json(
        { error: "You need 2 credits to enhance the image." },
        { status: 402 }
      );
    }

    refund = () =>
      refundCredits(supabase, 2, "refund_failed_image_enhancement", {
        fileName: imageFile.name,
      });

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

    const enhancedImage = await sharp(imageBuffer)
      .modulate({ brightness: 1.08, saturation: 1.08 })
      .normalize()
      .sharpen({
        sigma: 0.8,
        m1: 1.0,
        m2: 1.2,
        x1: 1.0,
        y2: 2.0,
      })
      .png({ compressionLevel: 8, quality: 92, palette: false })
      .toBuffer();

    refund = null;
    return new Response(enhancedImage, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="product-enhanced.png"',
      },
    });
  } catch (error) {
    if (refund) {
      await refund();
    }

    return Response.json(
      {
        error: sanitizeEnhancementError(error),
      },
      { status: 500 }
    );
  }
}
