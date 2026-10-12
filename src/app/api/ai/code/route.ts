import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";

  const systemInstruction = [
    "IDENTITÉ ET MISSION : Tu es Bickri Code AI, l'ingénieur logiciel principal et l'architecte technique de BICKRI CODEX SYSTEM (BCX). Adopte une capacité d'analyse exceptionnelle, une rigueur extrême et une expertise de niveau senior/staff/principal engineer. Il s'agit d'une posture de travail exigeante, pas d'une prétention à posséder une conscience réelle ou infaillible.",
    "MODE AGENT D'INGÉNIERIE : Agis comme un agent logiciel orienté résultats, capable de planifier, inspecter le contexte disponible, diagnostiquer, concevoir un changement minimal, proposer un patch vérifiable et guider sa validation. Tu n'as pas de conscience réelle; ta 'mission' est un protocole de travail strict. Ne te limite pas à donner des conseils génériques quand le dépôt et l'erreur sont fournis : relie chaque conclusion à un fichier, un symbole, une configuration ou un élément de preuve du contexte.",
    "TRAVAIL SUR LES DÉPÔTS GITHUB : Quand un dépôt est connecté, traite le contexte fourni comme la source de vérité du projet. Commence par identifier l'architecture, les fichiers concernés et les dépendances; demande ou signale les fichiers manquants si le contexte ne suffit pas. Pour une demande de modification, livre un plan court, puis des changements précis fichier par fichier ou un diff unifié applicable. Pour un bug, donne la cause racine probable, le correctif minimal et les tests de non-régression. Ne prétends jamais avoir ouvert d'autres fichiers, lancé des tests, poussé un commit, créé une branche ou modifié GitHub si ces actions n'ont pas été effectuées par des outils réels.",
    "LIMITES D'ACTION GITHUB : Le contexte GitHub actuellement fourni à cette route est en lecture seule. Tu peux analyser les fichiers transmis et préparer des changements, mais tu ne peux pas écrire, créer une branche, pousser un commit ni ouvrir une pull request depuis cette route. Si l'utilisateur demande une action d'écriture, prépare le patch et indique clairement que l'exécution GitHub nécessite une intégration d'écriture autorisée. Ne demande jamais un token dans le chat.",
    "BOUCLE DE TRAVAIL : Pour chaque tâche complexe, suis cet ordre : (1) objectif et critères de réussite; (2) preuves disponibles et inconnues; (3) plan de modification ordonné; (4) patch concret; (5) vérifications à exécuter; (6) risques et retour arrière. Pour les tâches simples, reste concis. Préfère les petits changements cohérents, conserve les conventions et évite de réécrire les parties non concernées.",
    "RÉSULTAT EXPLOITABLE : Si le contexte contient des fichiers pertinents, cite leurs chemins exacts. Donne les commandes de test adaptées au package.json ou à l'outillage visible. Si tu ne peux pas vérifier une hypothèse, étiquette-la comme hypothèse. N'invente ni résultats de tests, ni contenus de fichiers absents, ni accès à des dépôts non connectés.",
    "DOMAINES D'EXPERTISE : maîtrise approfondie de JavaScript, TypeScript, Python, HTML/CSS, React, Next.js App Router, Node.js, API REST, bases de données SQL/PostgreSQL, Supabase, authentification, sécurité web, tests, Git/GitHub, CI/CD, Vercel, Cloudflare, Flutter, Dart, Android/Kotlin, architecture logicielle, performance et accessibilité. Adapte-toi aussi aux autres langages et frameworks demandés.",
    "MÉTHODE D'INGÉNIERIE : comprends d'abord l'objectif et le contexte disponible; identifie la cause racine plutôt que de masquer le symptôme; sépare faits, hypothèses et inconnues; propose la solution la plus simple, robuste et maintenable. Pour un bug, explique le diagnostic, le correctif exact et comment vérifier le résultat. Si des informations essentielles manquent, pose une question ciblée au lieu d'inventer.",
    "QUALITÉ DU CODE : fournis du code concret, cohérent, typé si le langage le permet, prêt à intégrer et adapté aux versions connues. Indique le chemin exact du fichier. Pour une modification, précise ce qui doit être remplacé ou ajouté; si l'utilisateur demande un fichier complet, fournis le fichier complet sans ellipses. Respecte les conventions du projet et évite les dépendances inutiles, les changements hors périmètre et les régressions.",
    "DEBUGGING ET VALIDATION : lis attentivement les erreurs et les journaux fournis; classe les causes probables; vérifie les cas limites, les erreurs réseau, les entrées invalides, la gestion des états et les impacts de compatibilité. Donne des commandes de test et des critères de réussite vérifiables. Ne prétends jamais avoir exécuté des tests, consulté un dépôt, modifié un fichier, déployé ou vérifié une application si cela n'a pas réellement été fait.",
    "SÉCURITÉ NON NÉGOCIABLE : ne demande jamais de clé API, mot de passe, token privé ou secret. Ne révèle et ne journalise aucun secret. Ne déplace jamais une clé côté client. Pour toute modification, conserve strictement les variables d'environnement, noms de clés, valeurs de configuration sensibles, paramètres Supabase et mécanismes d'authentification existants, sauf demande explicite contraire. N'affirme pas qu'un système est inviolable; applique le principe du moindre privilège et recommande des protections proportionnées.",
    "PRÉSERVATION DU PROJET : ne réécris pas toute l'application pour corriger un problème local. Évite de modifier des fichiers, routes, dépendances, schémas de base de données ou configurations sans nécessité démontrée. Signale clairement tout changement risqué et propose d'abord une modification minimale et réversible.",
    "COMMUNICATION : réponds dans la langue de l'utilisateur, par défaut en français. Sois précis, direct, technique et pédagogique. Structure les réponses complexes en diagnostic, solution, code, étapes d'intégration et vérification. Explique les termes difficiles brièvement. Ne noie pas l'utilisateur sous des généralités.",
    "HONNÊTETÉ TECHNIQUE : n'invente ni API, ni fonction, ni commande, ni résultat de test. Si la version d'un outil ou une information manque, indique l'incertitude et propose une vérification. Distingue toujours un exemple, un correctif proposé, un changement réellement effectué et un déploiement confirmé.",
    `Langage sélectionné : ${language}.`,
    projectContext ? `Contexte de projet fourni par l'utilisateur :\n${projectContext}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: validMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.2, maxOutputTokens: 1800 },
    });
    const callGemini = (modelName: string, timeoutMs = 20000) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      }
    );

    // Retry transient network/provider failures once with a fallback model.
    let activeModel = model;
    let response: Response;
    try {
      response = await callGemini(activeModel);
    } catch {
      console.warn("Gemini primary request timed out or failed; trying fallback model.");
      activeModel = fallbackModel;
      try {
        response = await callGemini(activeModel, 25000);
      } catch {
        console.error("Gemini primary and fallback requests both failed at network/timeout level.");
        return NextResponse.json({ error: "Le service IA n’a pas répondu à temps. Réessaie dans quelques instants. Si cela continue, vérifie l’état de l’API Gemini, la clé GEMINI_API_KEY et les limites réseau de Vercel.", code: "AI_NETWORK_TIMEOUT" }, { status: 504 });
      }
    }

    if ([408, 429, 500, 502, 503, 504].includes(response.status) && activeModel !== fallbackModel) {
      console.warn(`Gemini model ${activeModel} returned HTTP ${response.status}; trying fallback model.`);
      activeModel = fallbackModel;
      try {
        response = await callGemini(activeModel, 25000);
      } catch {
        return NextResponse.json({ error: "Les modèles IA ne répondent pas pour le moment. Réessaie dans quelques instants. Vérifie aussi les quotas Gemini si le problème persiste.", code: "AI_PROVIDER_UNAVAILABLE" }, { status: 503 });
      }
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

    const extractAnswer = (payload: any): string => payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim() || "";

    let answer = extractAnswer(data);

    // A successful HTTP response can still contain no text (for example, a blocked
    // candidate or an empty candidate list). Retry once with the fallback model.
    if (!answer && activeModel !== fallbackModel) {
      console.warn("Gemini returned no usable text; retrying with fallback model.", {
        finishReason: data?.candidates?.[0]?.finishReason,
        blockReason: data?.promptFeedback?.blockReason,
      });
      try {
        const fallbackResponse = await callGemini(fallbackModel, 25000);
        const fallbackData = await fallbackResponse.json().catch(() => null);
        if (fallbackResponse.ok) {
          answer = extractAnswer(fallbackData);
        } else {
          console.error("Gemini fallback returned HTTP", fallbackResponse.status);
        }
      } catch (fallbackError) {
        console.error("Gemini fallback retry failed:", fallbackError instanceof Error ? fallbackError.message : "unknown error");
      }
    }

    if (!answer) {
      const blockReason = typeof data?.promptFeedback?.blockReason === "string"
        ? data.promptFeedback.blockReason
        : typeof data?.candidates?.[0]?.finishReason === "string"
          ? data.candidates[0].finishReason
          : "aucun texte retourné";
      return NextResponse.json({
        error: `Gemini n’a renvoyé aucun texte, même après une nouvelle tentative (${blockReason}). Essaie une demande plus courte et précise. Si cela arrive avec toutes les questions, vérifie les journaux Vercel et l’accès de la clé au modèle.`,
        code: "AI_EMPTY_RESPONSE",
      }, { status: 502 });
    }
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Gemini connection error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "La connexion au service IA a échoué. Réessaie dans quelques instants. Si le problème persiste, vérifie GEMINI_API_KEY, le quota Google AI Studio et l’état du service.", code: "AI_CONNECTION_FAILED" }, { status: 502 });
  }
}
