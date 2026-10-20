import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MODEL = "imagen-3.0-generate-002";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const FALLBACK_MODELS = ["gemini-2.5-flash-image"] as const;

type GeminiImage = { data?: string; mime_type?: string; mimeType?: string };
type GeminiContentPart = {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};
type GeminiStep = { content?: GeminiContentPart[] | string; output_image?: GeminiImage };
type GeminiResponse = {
  predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  output_image?: GeminiImage;
  steps?: GeminiStep[];
  candidates?: Array<{ content?: { parts?: GeminiContentPart[] } }>;
  error?: { message?: string; status?: string };
};

function imageFromPart(part: GeminiContentPart) {
  const inline = part.inlineData ?? part.inline_data;
  const inlineRecord = inline as { data?: string; mime_type?: string; mimeType?: string } | undefined;
  const data = part.data ?? inlineRecord?.data;
  const mimeType = part.mime_type ?? part.mimeType ?? inlineRecord?.mime_type ?? inlineRecord?.mimeType;
  if (data && (!part.type || part.type === "image" || inline)) {
    return { data, mimeType: mimeType ?? "image/png" };
  }
  return null;
}

function extractImage(result: GeminiResponse) {
  const prediction = result.predictions?.find((item) => typeof item.bytesBase64Encoded === "string" && item.bytesBase64Encoded.length > 0);
  if (prediction?.bytesBase64Encoded) {
    return { data: prediction.bytesBase64Encoded, mimeType: prediction.mimeType ?? "image/png" };
  }

  if (result.output_image?.data) {
    return {
      data: result.output_image.data,
      mimeType: result.output_image.mime_type ?? result.output_image.mimeType ?? "image/png",
    };
  }

  for (const step of result.steps ?? []) {
    if (step.output_image?.data) {
      return {
        data: step.output_image.data,
        mimeType: step.output_image.mime_type ?? step.output_image.mimeType ?? "image/png",
      };
    }
    if (Array.isArray(step.content)) {
      for (const part of step.content) {
        const image = imageFromPart(part);
        if (image) return image;
      }
    }
  }

  for (const candidate of result.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const image = imageFromPart(part);
      if (image) return image;
    }
  }
  return null;
}

function extractText(result: GeminiResponse) {
  const stepText = (result.steps ?? [])
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  const candidateText = (result.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return (stepText || candidateText).slice(0, 600);
}


async function generateWithOpenAI(prompt: string, apiKey: string): Promise<NextResponse | null> {
  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "high",
        output_format: "png",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const result = await upstream.json().catch(() => null) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } } | null;
    if (!upstream.ok || !result?.data?.[0]?.b64_json) {
      console.error("OpenAI image request failed", { status: upstream.status, detail: result?.error?.message?.slice(0, 300) });
      return NextResponse.json({ error: upstream.status === 429 ? "Le quota OpenAI est atteint. Vérifie ta facturation et tes limites." : "Le modèle OpenAI GPT Image n’a pas pu générer cette image. Vérifie la clé API, les crédits et l’accès au modèle, puis réessaie." }, { status: upstream.status === 429 ? 429 : 502 });
    }
    return NextResponse.json({ image: `data:image/png;base64,${result.data[0].b64_json}`, mimeType: "image/png", model: OPENAI_IMAGE_MODEL });
  } catch (error) {
    console.error("OpenAI image request error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Le service OpenAI GPT Image ne répond pas actuellement. Réessaie dans un instant." }, { status: 502 });
  }
}

async function generateWithPollinations(args: { prompt: string; mode: string; imageData: string; mimeType: string; apiKey: string }): Promise<{ ok: boolean; response: NextResponse }> {
  const { prompt, mode, imageData, mimeType, apiKey } = args;
  try {
    let upstream: Response;
    if (mode === "edit" && imageData) {
      // Pollinations image edits use OpenAI-compatible multipart form data.
      const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
      const binary = Buffer.from(base64, "base64");
      if (binary.byteLength > MAX_IMAGE_BYTES) {
        return { ok: false, response: NextResponse.json({ error: "Image trop volumineuse (maximum 8 Mo)." }, { status: 413 }) };
      }
      const form = new FormData();
      form.set("prompt", prompt);
      form.set("model", process.env.POLLINATIONS_IMAGE_MODEL || "google/gemini-2.5-flash-image");
      form.set("size", "1024x1280");
      form.set("image", new Blob([binary], { type: mimeType }), "source-image");
      upstream = await fetch("https://gen.pollinations.ai/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      });
    } else {
      const url = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
      url.searchParams.set("model", process.env.POLLINATIONS_IMAGE_MODEL || "flux");
      url.searchParams.set("width", "1024");
      url.searchParams.set("height", "1280");
      url.searchParams.set("nologo", "true");
      upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/*" },
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      });
    }

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => "")).slice(0, 250);
      console.error("Pollinations image request failed", { status: upstream.status, detail });
      const status = upstream.status === 401 || upstream.status === 403 ? upstream.status : upstream.status === 402 ? 402 : 502;
      return { ok: false, response: NextResponse.json({ error: status === 402 ? "Le solde ou la limite Pollinations est atteint." : status === 401 || status === 403 ? "La clé Pollinations est invalide ou n’a pas l’autorisation requise." : "Pollinations n’a pas pu générer l’image. Réessaie." }, { status }) };
    }
    const contentType = upstream.headers.get("content-type")?.split(";")[0] ?? "";
    if (!/^image\/(png|jpeg|webp)$/.test(contentType)) {
      return { ok: false, response: NextResponse.json({ error: "Pollinations a renvoyé un format inattendu." }, { status: 502 }) };
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > 12 * 1024 * 1024) {
      return { ok: false, response: NextResponse.json({ error: "L’image générée est vide ou trop volumineuse." }, { status: 502 }) };
    }
    return { ok: true, response: NextResponse.json({ image: `data:${contentType};base64,${bytes.toString("base64")}`, mimeType: contentType, model: `pollinations/${process.env.POLLINATIONS_IMAGE_MODEL || "flux"}` }) };
  } catch (error) {
    console.error("Pollinations image request error", error instanceof Error ? error.message : "unknown");
    return { ok: false, response: NextResponse.json({ error: "Pollinations ne répond pas actuellement. Vérifie la clé API et réessaie." }, { status: 502 }) };
  }
}

export async function POST(request: NextRequest) {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;
  const pollinationsApiKey = process.env.POLLINATIONS_API_KEY;
  if (!geminiApiKey && !openAiApiKey && !pollinationsApiKey) {
    return NextResponse.json(
      { error: "La génération d’images n’est pas configurée. Ajoute OPENAI_API_KEY, GEMINI_API_KEY ou POLLINATIONS_API_KEY dans Vercel." },
      { status: 503 },
    );
  }

  const limit = rateLimit(`images:${clientKey(request.headers)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Limite atteinte. Réessaie dans ${limit.retryAfter} secondes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { prompt?: unknown; mode?: unknown; imageData?: unknown; mimeType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  const mode = body.mode === "edit" ? "edit" : "generate";
  if (prompt.length < 3) {
    return NextResponse.json({ error: "Décris l’image à créer ou les modifications souhaitées." }, { status: 400 });
  }

  const input: Array<Record<string, string>> = [];
  if (mode === "edit") {
    const imageData = typeof body.imageData === "string" ? body.imageData : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    if (!imageData || !ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json({ error: "Pour modifier une photo, importe une image JPG, PNG ou WebP." }, { status: 400 });
    }

    const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || Math.floor(base64.length * 0.75) > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image invalide ou trop volumineuse (maximum 8 Mo)." }, { status: 413 });
    }
    input.push({ type: "image", data: base64, mime_type: mimeType });
  }

  input.push({
    type: "text",
    text: mode === "edit"
      ? `Modifie l’image fournie en respectant cette demande : ${prompt}. Retourne l’image modifiée, pas seulement une description. Préserve les éléments qui ne doivent pas changer.`
      : `Crée une image originale de haute qualité à partir de cette description : ${prompt}. Retourne une image, pas seulement une description textuelle.`,
  });

  if (mode === "edit" && !geminiApiKey && !pollinationsApiKey) {
    return NextResponse.json({ error: "La modification de photos nécessite GEMINI_API_KEY ou POLLINATIONS_API_KEY. DALL·E 3 est disponible pour les nouvelles créations." }, { status: 503 });
  }

  // Provider order: Gemini first, then Pollinations, then OpenAI for new image generation.
  // OpenAI's Images API here supports generation, not the photo-edit workflow.
  if (!geminiApiKey) {
    if (pollinationsApiKey) {
      const generated = await generateWithPollinations({ prompt, mode, imageData: typeof body.imageData === "string" ? body.imageData : "", mimeType: typeof body.mimeType === "string" ? body.mimeType : "", apiKey: pollinationsApiKey });
      if (generated.ok) return generated.response;
      if (mode === "generate" && openAiApiKey) {
        const openAiFallback = await generateWithOpenAI(prompt, openAiApiKey);
        if (openAiFallback) return openAiFallback;
      }
      return generated.response;
    }
    if (mode === "generate" && openAiApiKey) {
      const openAiFallback = await generateWithOpenAI(prompt, openAiApiKey);
      if (openAiFallback) return openAiFallback;
    }
  }

  // A trailing dot or whitespace is a common Vercel env-var typo; normalize it.
  const configuredModel = (process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL).trim().replace(/[.\s]+$/, "");
  const models = [...new Set([configuredModel || DEFAULT_MODEL, ...FALLBACK_MODELS])];
  let lastStatus = 502;
  let lastDetail = "";
  let lastModel = models[0];
  let finalResult: GeminiResponse | null = null;

  for (const model of models) {
    lastModel = model;
    let response: Response;
    try {
      const isImagenPredict = mode === "generate" && model.startsWith("imagen-");
      response = await fetch(
        isImagenPredict
          ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(geminiApiKey!)}`
          : "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(!isImagenPredict ? { "x-goog-api-key": geminiApiKey! } : {}),
          },
          body: JSON.stringify(isImagenPredict
            ? {
                instances: [{ prompt: prompt }],
                parameters: { sampleCount: 1, aspectRatio: "3:4" },
              }
            : {
                model,
                input,
                response_format: {
                  type: "image",
                  mime_type: "image/png",
                  aspect_ratio: "4:5",
                  image_size: "1K",
                },
              }),
          cache: "no-store",
          signal: AbortSignal.timeout(55_000),
        },
      );
    } catch {
      lastStatus = 502;
      lastDetail = "Gemini request timed out or could not connect.";
      console.error("Gemini image request failed", { model, status: lastStatus, detail: lastDetail });
      break;
    }

    const result = await response.json().catch(() => null) as GeminiResponse | null;
    if (response.ok && result) {
      finalResult = result;
      break;
    }

    lastStatus = response.status;
    lastDetail = typeof result?.error?.message === "string" ? result.error.message.slice(0, 300) : "";
    console.error("Gemini image request failed", { model, status: lastStatus, detail: lastDetail });

    // Retry only when a model identifier/endpoint is rejected, not for auth or quota failures.
    if (response.status !== 404 && response.status !== 400) break;
  }

  if (!finalResult) {
    // Automatic fallback chain: Pollinations first, then OpenAI for new image generation.
    if (pollinationsApiKey) {
      const fallback = await generateWithPollinations({ prompt, mode, imageData: typeof body.imageData === "string" ? body.imageData : "", mimeType: typeof body.mimeType === "string" ? body.mimeType : "", apiKey: pollinationsApiKey });
      if (fallback.ok) return fallback.response;
      console.error("Pollinations image fallback failed", { geminiStatus: lastStatus });
      if (mode === "generate" && openAiApiKey) {
        const openAiFallback = await generateWithOpenAI(prompt, openAiApiKey);
        if (openAiFallback) return openAiFallback;
      }
      return fallback.response;
    }
    if (mode === "generate" && openAiApiKey) {
      const openAiFallback = await generateWithOpenAI(prompt, openAiApiKey);
      if (openAiFallback) return openAiFallback;
    }
    const message = lastStatus === 401 || lastStatus === 403
      ? "La clé Gemini est invalide ou n’a pas accès à la génération d’images. Vérifie GEMINI_API_KEY dans Vercel."
      : lastStatus === 429
        ? "Le quota Gemini est atteint. Vérifie les limites et la facturation de ton projet Google AI."
        : lastStatus === 404 || lastStatus === 400
          ? "Aucun des modèles Gemini Image configurés n’est disponible pour cette clé. Vérifie l’accès au modèle dans Google AI Studio."
          : "La génération d’image Gemini a échoué. Vérifie la configuration et réessaie.";
    return NextResponse.json(
      { error: message, providerDetail: lastDetail || undefined, model: lastModel },
      { status: lastStatus === 429 ? 429 : 502 },
    );
  }

  const generated = extractImage(finalResult);
  if (generated?.data && /^image\/(png|jpeg|webp)$/.test(generated.mimeType)) {
    return NextResponse.json({
      image: `data:${generated.mimeType};base64,${generated.data}`,
      mimeType: generated.mimeType,
      model: lastModel,
    });
  }

  const text = extractText(finalResult);
  console.error("Gemini image response contained no image", { model: lastModel, text });
  if (pollinationsApiKey) {
    const fallback = await generateWithPollinations({ prompt, mode, imageData: typeof body.imageData === "string" ? body.imageData : "", mimeType: typeof body.mimeType === "string" ? body.mimeType : "", apiKey: pollinationsApiKey });
    if (fallback.ok) return fallback.response;
    if (mode === "generate" && openAiApiKey) {
      const openAiFallback = await generateWithOpenAI(prompt, openAiApiKey);
      if (openAiFallback) return openAiFallback;
    }
    return fallback.response;
  }
  if (mode === "generate" && openAiApiKey) {
    const openAiFallback = await generateWithOpenAI(prompt, openAiApiKey);
    if (openAiFallback) return openAiFallback;
  }
  return NextResponse.json(
    { error: text || "Gemini n’a renvoyé aucune image. Essaie une description plus précise.", model: lastModel },
    { status: 502 },
  );
}
