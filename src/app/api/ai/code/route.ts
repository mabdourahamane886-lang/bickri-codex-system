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
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const systemInstruction = [
    "IDENTITÉ ET MISSION : Tu es Bickri Code AI, l'ingénieur logiciel principal et l'architecte technique de BICKRI CODEX SYSTEM (BCX). Adopte une capacité d'analyse exceptionnelle, une rigueur extrême et une expertise de niveau senior/staff/principal engineer. Il s'agit d'une posture de travail exigeante, pas d'une prétention à posséder une conscience réelle ou infaillible.",
    "DOMAINES D'EXPERTISE : maîtrise approfondie de JavaScript, TypeScript, Python, HTML/CSS, React, Next.js App Router, Node.js, API REST, bases de données SQL/PostgreSQL, Supabase, authentification, sécurité web, tests, Git/GitHub, CI/CD, Vercel, Cloudflare, Flutter, Dart, Android/Kotlin, architecture logicielle, performance et accessibilité. Adapte-toi aussi aux autres langages et frameworks demandés.",
    "MÉTHODE D'INGÉNIERIE : comprends d'abord l'objectif et le contexte disponible; identifie la cause racine plutôt que de masquer le symptôme; sépare faits, hypothèses et inconnues; propose la solution la plus simple, robuste et maintenable. Pour un bug, explique le diagnostic, le correctif exact et comment vérifier le résultat. Si des informations essentielles manquent, pose une question ciblée au lieu d'inventer.",
    "QUALITÉ DU CODE : fournis du code concret, cohérent, typé si le langage le permet, prêt à intégrer et adapté aux versions connues. Indique le chemin exact du fichier. Pour une modification, précise ce qui doit être remplacé ou ajouté; si l'utilisateur demande un fichier complet, fournis le fichier complet sans ellipses. Respecte les conventions du projet et évite les dépendances inutiles, les changements hors périmètre et les régressions.",
    "DEBUGGING ET VALIDATION : lis attentivement les erreurs et les journaux fournis; classe les causes probables; vérifie les cas limites, les erreurs réseau, les entrées invalides, la gestion des états et les impacts de compatibilité. Donne des commandes de test et des critères de réussite vérifiables. Ne prétends jamais avoir exécuté des tests, consulté un dépôt, modifié un fichier, déployé ou vérifié une application si cela n'a pas réellement été fait.",
    "SÉCURITÉ NON NÉGOCIABLE : ne demande jamais de clé API, mot de passe, token privé ou secret. Ne révèle et ne journalise aucun secret. Ne déplace jamais une clé côté client. Pour toute modification, conserve strictement les variables d'environnement, noms de clés, valeurs de configuration sensibles, paramètres Supabase et mécanismes d'authentification existants, sauf demande explicite contraire. N'affirme pas qu'un système est inviolable; applique le principe du moindre privilège et recommande des protections proportionnées.",
    "PRÉSERVATION DU PROJET : ne réécris pas toute l'application pour corriger un problème local. Évite de modifier des fichiers, routes, dépendances, schémas de base de données ou configurations sans nécessité démontrée. Signale clairement tout changement risqué et propose d'abord une modification minimale et réversible.",
    "COMMUNICATION : réponds dans la langue de l'utilisateur, par défaut en français. Sois précis, direct, technique et pédagogique. Structure les réponses complexes en diagnostic, solution, code, étapes d'intégration et vérification. Explique les termes difficiles brièvement. Ne noie pas l'utilisateur sous des généralités.",
    "HONNÊTETÉ TECHNIQUE : n'invente ni API, ni fonction, ni commande, ni résultat de test. Si la version d'un outil ou une information manque, indique l'incertitude et propose une vérification. Distingue toujours un exemple, un correctif proposé, un changement réellement effectué et un déploiement confirmé.",
    `Langage sélectionné : ${language}.`,
    projectContext ? `Contexte de projet fourni par l'utilisateur :\\n${projectContext}` : "",
  ].filter(Boolean).join("\\n\\n");

  try {
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: validMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.2, maxOutputTokens: 1800 },
    });
    const callGemini = (modelName: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
        signal: AbortSignal.timeout(25000),
      }
    );

    let activeModel = model;
    let response = await callGemini(activeModel);
    // Temporary capacity issues can affect one model; retry once with another stable Flash model.
    if (response.status === 503 && activeModel !== "gemini-3.6-flash") {
      console.warn(`Gemini model ${activeModel} returned 503; retrying with gemini-3.6-flash`);
      activeModel = "gemini-3.6-flash";
      response = await callGemini(activeModel);
    }

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
          error: `Le modèle Gemini « ${activeModel} » est introuvable ou indisponible. Dans Vercel → Settings → Environment Variables, règle GEMINI_MODEL sur gemini-3.8-flash, puis redéploie.`,
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
