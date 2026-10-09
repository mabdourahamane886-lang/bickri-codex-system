import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "L’assistant IA n’est pas encore configuré. Ajoute OPENAI_API_KEY dans les variables d’environnement Vercel, puis redéploie BCX." },
      { status: 503 }
    );
  }

  let body: { messages?: Message[]; language?: string; projectContext?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const validMessages = messages
    .filter((m): m is Message => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!validMessages.length || !validMessages.some((m) => m.role === "user")) {
    return NextResponse.json({ error: "Écris une question de programmation avant d’envoyer." }, { status: 400 });
  }

  const language = typeof body.language === "string" ? body.language.slice(0, 80) : "multi-langage";
  const projectContext = typeof body.projectContext === "string" ? body.projectContext.slice(0, 12000) : "";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: [
              "Tu es Bickri Code AI, un assistant senior de programmation intégré à BICKRI CODEX SYSTEM (BCX).",
              "Réponds dans la langue de l'utilisateur, par défaut en français. Sois précis, pratique et pédagogique.",
              "Pour le code, donne des blocs complets et indique les chemins de fichiers si le contexte les fournit.",
              "N'affirme jamais avoir exécuté, testé, enregistré ou déployé du code si cela n'a pas réellement été fait.",
              "Ne demande jamais de clés secrètes, mots de passe ou jetons privés. Ne révèle pas les secrets.",
              `Langage sélectionné : ${language}.`,
              projectContext ? `Contexte de projet fourni par l'utilisateur :\n${projectContext}` : "",
            ].filter(Boolean).join("\n\n"),
          },
          ...validMessages,
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof data?.error?.message === "string" ? data.error.message : "Le fournisseur IA a refusé la requête.";
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "L’assistant n’a pas renvoyé de réponse exploitable." }, { status: 502 });
    }
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: "Impossible de joindre le service IA. Vérifie la configuration et réessaie." }, { status: 502 });
  }
}
