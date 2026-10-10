import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "L’assistant IA n’est pas configuré. Ajoute GEMINI_API_KEY dans les variables d’environnement Vercel, puis redéploie BCX." },
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
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
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
      const providerMessage = typeof data?.error?.message === "string" ? data.error.message : "";
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: "Gemini a refusé la requête. Vérifie que GEMINI_API_KEY est correcte, que l’API Gemini est activée et que le modèle est disponible pour ton projet." },
          { status: 502 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "La limite de requêtes Gemini est atteinte. Réessaie plus tard ou vérifie les limites de ton compte Google AI Studio." },
          { status: 429 }
        );
      }
      console.error("Gemini API error", response.status, providerMessage.slice(0, 300));
      return NextResponse.json({ error: "Le service Gemini est temporairement indisponible. Réessaie plus tard." }, { status: 502 });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();

    if (!answer) {
      return NextResponse.json({ error: "Gemini n’a pas renvoyé de réponse exploitable. Réessaie avec une autre question." }, { status: 502 });
    }
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: "Impossible de joindre Gemini. Vérifie la connexion et réessaie." }, { status: 502 });
  }
}
