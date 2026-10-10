import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La variable GEMINI_API_KEY est absente dans Vercel. Ajoute-la dans Settings → Environment Variables puis redéploie." },
      { status: 503 }
    );
  }

  let body: { messages?: Message[]; language?: string; projectContext?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const validMessages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is Message => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!validMessages.length || !validMessages.some((m) => m.role === "user")) {
    return NextResponse.json({ error: "Écris une question de programmation avant d’envoyer." }, { status: 400 });
  }

  const language = typeof body.language === "string" ? body.language.slice(0, 80) : "multi-langage";
  const projectContext = typeof body.projectContext === "string" ? body.projectContext.slice(0, 12000) : "";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const systemInstruction = [
    "Tu es Bickri Code AI, un assistant senior de programmation intégré à BICKRI CODEX SYSTEM (BCX).",
    "Réponds dans la langue de l'utilisateur, par défaut en français. Sois précis, pratique et pédagogique.",
    "Pour le code, donne des blocs complets et indique les chemins de fichiers si le contexte les fournit.",
    "N'affirme jamais avoir exécuté, testé, enregistré ou déployé du code si cela n'a pas réellement été fait.",
    "Ne demande jamais de clés secrètes, mots de passe ou jetons privés. Ne révèle pas les secrets.",
    `Langage sélectionné : ${language}.`,
    projectContext ? `Contexte de projet fourni par l'utilisateur :\n${projectContext}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: validMessages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.2, maxOutputTokens: 1800 },
        }),
        signal: AbortSignal.timeout(25000),
      }
    );

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const providerMessage = typeof data?.error?.message === "string" ? data.error.message.slice(0, 350) : "";
      console.error("Gemini API error", response.status, providerMessage);

      if (response.status === 400 || response.status === 401) {
        return NextResponse.json({
          error: `Gemini a rejeté la requête (HTTP ${response.status}). Vérifie la clé GEMINI_API_KEY et le modèle GEMINI_MODEL. Détail : ${providerMessage || "requête invalide"}`,
        }, { status: 502 });
      }
      if (response.status === 403) {
        return NextResponse.json({
          error: `Gemini refuse l’accès (HTTP 403). Vérifie que l’API Gemini est activée et que ta clé a accès au projet. Détail : ${providerMessage || "accès refusé"}`,
        }, { status: 502 });
      }
      if (response.status === 404) {
        return NextResponse.json({
          error: `Le modèle Gemini « ${model} » est introuvable ou indisponible. Dans Vercel, vérifie GEMINI_MODEL et utilise un modèle disponible dans ton projet.`,
        }, { status: 502 });
      }
      if (response.status === 429 || response.status === 402) {
        return NextResponse.json({
          error: `La limite ou le quota Gemini est atteint (HTTP ${response.status}). Vérifie les quotas et la facturation Google AI Studio. Détail : ${providerMessage || "quota dépassé"}`,
        }, { status: 429 });
      }
      if (response.status === 503 || response.status === 500 || response.status === 504) {
        return NextResponse.json({
          error: `Gemini est temporairement indisponible (HTTP ${response.status}). Réessaie dans quelques minutes. Détail : ${providerMessage || "service indisponible"}`,
        }, { status: 502 });
      }
      return NextResponse.json({
        error: `Erreur de l’API Gemini (HTTP ${response.status}). ${providerMessage || "Vérifie la configuration dans Google AI Studio."}`,
      }, { status: 502 });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();

    if (!answer) {
      return NextResponse.json({ error: "Gemini n’a pas renvoyé de réponse exploitable. Réessaie avec une autre question." }, { status: 502 });
    }
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Gemini connection error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Impossible de joindre Gemini : délai dépassé ou erreur réseau. Réessaie." }, { status: 502 });
  }
}
