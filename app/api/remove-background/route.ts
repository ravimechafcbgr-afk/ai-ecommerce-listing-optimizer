import { NextRequest } from "next/server";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
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

export async function POST(request: NextRequest) {
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
        { error: "Please upload an image smaller than 10 MB." },
        { status: 400 }
      );
    }

    const apiKey = (process.env.REMOVE_BG_API_KEY ?? "").trim();
    if (!apiKey) {
      return Response.json(
        { error: "remove.bg API key is missing on the server." },
        { status: 500 }
      );
    }

    const uploadForm = new FormData();
    uploadForm.append("image_file", imageFile, imageFile.name || "uploaded-image.png");
    uploadForm.append("size", "auto");

    const removeBgResponse = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: uploadForm,
    });

    if (!removeBgResponse.ok) {
      const responseText = await removeBgResponse.text();
      let message = "Unable to remove the background right now.";

      try {
        const errorPayload = JSON.parse(responseText) as {
          errors?: Array<{ title?: string; detail?: string; code?: string }>;
          error?: string;
        };

        const firstError = errorPayload?.errors?.[0];
        if (firstError?.detail) {
          message = firstError.detail;
        } else if (firstError?.title) {
          message = firstError.title;
        } else if (errorPayload?.error) {
          message = errorPayload.error;
        }
      } catch {
        if (responseText) {
          message = responseText.slice(0, 200);
        }
      }

      return Response.json(
        { error: message },
        { status: removeBgResponse.status || 500 }
      );
    }

    const processedImage = await removeBgResponse.arrayBuffer();
    const outputImage = Buffer.from(processedImage);

    return new Response(outputImage, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="product-no-background.png"',
      },
    });
  } catch (error) {
    console.error("Background removal failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove the background right now.",
      },
      { status: 500 }
    );
  }
}
