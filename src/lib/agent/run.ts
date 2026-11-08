import "server-only";
import { generateContent, type GeminiContent, type GeminiPart } from "@/lib/ai/gemini-raw";
import { buildSystemInstruction } from "@/lib/ai/prompt";
import { getThinkingInstruction, resolveThinkingMode, type ThinkingMode } from "@/lib/ai/thinking";
import { formatRetrievedKnowledge, retrieveKnowledge } from "@/lib/ai/knowledge-retrieval";
import { formatWebSearchResults, searchWeb, shouldSearchWeb, type WebSearchResult } from "@/lib/ai/web-search";
import { fetchPublic } from "./plugins/web";
import { PLUGINS } from "./plugins";
import type { AgentContext, PluginStatus, Tool } from "./types";
import { formatSpecialistReviews, runSpecialistReviews } from "./specialist-orchestrator";

export type AgentEvent = { tool: string; label: string; write: boolean; status: "ok" | "error" | "refused" | "pending" };
export type AgentResult = {
  contents: GeminiContent[];
  events: AgentEvent[];
  answer?: string;
  pending?: { tool: string; label: string; args: Record<string, unknown> }[];
  continue?: boolean;
  model?: string;
  plugins: PluginStatus[];
  sources?: Array<{ title: string; url: string; snippet: string; provider: string; opened: boolean; status?: number }>;
};

const MAX_STEPS = 12;
const TIME_BUDGET_MS = 240_000;
const MAX_HISTORY_CHARS = 250_000;

/** Nettoie l'historique reçu du navigateur : rôles, types et taille. */
export function sanitizeContents(input: unknown): GeminiContent[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-80).flatMap((c): GeminiContent[] => {
    if (!c || typeof c !== "object") return [];
    const role = (c as GeminiContent).role;
    const parts = (c as GeminiContent).parts;
    if ((role !== "user" && role !== "model") || !Array.isArray(parts)) return [];
    const clean = parts.flatMap((p): GeminiPart[] => {
      if (!p || typeof p !== "object") return [];
      const out: GeminiPart = {};
      if (typeof p.text === "string") out.text = p.text.slice(0, 40_000);
      // Les pièces jointes sont limitées aux types nécessaires à l'analyse multimodale.
      if (p.inlineData && typeof p.inlineData === "object") {
        const mimeType = typeof p.inlineData.mimeType === "string" ? p.inlineData.mimeType : "";
        const data = typeof p.inlineData.data === "string" ? p.inlineData.data : "";
        if (["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimeType) && data.length > 0 && data.length <= 6_000_000) {
          out.inlineData = { mimeType, data };
        }
      }
      if (p.thought === true) out.thought = true;
      if (typeof p.thoughtSignature === "string") out.thoughtSignature = p.thoughtSignature;
      if (p.functionCall && typeof p.functionCall.name === "string") out.functionCall = { ...(p.functionCall.id ? { id: String(p.functionCall.id) } : {}), name: p.functionCall.name, args: typeof p.functionCall.args === "object" && p.functionCall.args ? p.functionCall.args : {} };
      if (p.functionResponse && typeof p.functionResponse.name === "string") out.functionResponse = { ...(p.functionResponse.id ? { id: String(p.functionResponse.id) } : {}), name: p.functionResponse.name, response: typeof p.functionResponse.response === "object" && p.functionResponse.response ? p.functionResponse.response : {} };
      return Object.keys(out).length ? [out] : [];
    });
    return clean.length ? [{ role, parts: clean }] : [];
  });
}

/** Réduit la taille de l'historique en effaçant les plus anciens résultats d'outils. */
function compact(contents: GeminiContent[]) {
  let size = JSON.stringify(contents).length;
  for (const c of contents) {
    if (size <= MAX_HISTORY_CHARS) break;
    for (const p of c.parts) {
      if (p.functionResponse) {
        const before = JSON.stringify(p.functionResponse.response).length;
        p.functionResponse.response = { note: "[résultat ancien supprimé pour réduire la taille]" };
        size -= before;
      }
    }
  }
}

const callsOf = (c: GeminiContent | undefined) => (c?.role === "model" ? c.parts.filter((p) => p.functionCall).map((p) => p.functionCall!) : []);

async function execute(call: NonNullable<GeminiPart["functionCall"]>, tools: Map<string, Tool>, ctx: AgentContext, allowWrite: boolean, events: AgentEvent[], onProgress?: (event: AgentEvent) => void): Promise<GeminiPart> {
  const tool = tools.get(call.name);
  const args = call.args ?? {};
  const respond = (response: Record<string, unknown>): GeminiPart => ({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
  const emit = (event: AgentEvent) => { events.push(event); onProgress?.(event); };
  if (!tool) { emit({ tool: call.name, label: call.name, write: false, status: "error" }); return respond({ error: "Outil indisponible : le plugin est désactivé ou non autorisé." }); }
  const label = tool.label(args);
  if (tool.write && !allowWrite) { emit({ tool: call.name, label, write: true, status: "refused" }); return respond({ error: "L'utilisateur a refusé cette action. Ne la relance pas sans nouvelle demande." }); }
  try {
    const out = (await tool.run(args, ctx)) as Record<string, unknown>;
    const failed = Boolean(out && typeof out === "object" && "error" in out);
    emit({ tool: call.name, label, write: tool.write, status: failed ? "error" : "ok" });
    return respond(out && typeof out === "object" ? out : { result: out });
  } catch (err) {
    emit({ tool: call.name, label, write: tool.write, status: "error" });
    return respond({ error: err instanceof Error ? err.message.slice(0, 500) : "Erreur inconnue." });
  }
}

export async function runAgent(opts: {
  ctx: AgentContext;
  apiKey: string;
  contents: GeminiContent[];
  pluginIds: string[];
  language: string;
  projectContext: string;
  decision?: "approve" | "reject";
  thinkingMode?: ThinkingMode;
  onProgress?: (event: AgentEvent) => void;
  researchMode?: boolean;
}): Promise<AgentResult> {
  const started = Date.now();
  const events: AgentEvent[] = [];
  const emit = (event: AgentEvent) => { events.push(event); opts.onProgress?.(event); };
  const tools = new Map<string, Tool>();
  const closers: Array<() => Promise<void>> = [];
  const statuses: PluginStatus[] = [];

  const pluginResults = await Promise.all(PLUGINS.map(async (plugin) => {
    if (!opts.pluginIds.includes(plugin.id)) return { plugin, loaded: null };
    try { return { plugin, loaded: await plugin.load(opts.ctx) }; }
    catch (error) { return { plugin, loaded: { tools: [], reason: error instanceof Error ? error.message : "Connecteur indisponible." } }; }
  }));
  for (const { plugin, loaded } of pluginResults) {
    if (!loaded) { statuses.push({ id: plugin.id, name: plugin.name, description: plugin.description, available: false, reason: "Désactivé", tools: 0, writeTools: 0 }); continue; }
    loaded.tools.forEach((t) => tools.set(t.name, t));
    if ("close" in loaded && loaded.close) closers.push(loaded.close);
    statuses.push({ id: plugin.id, name: plugin.name, description: plugin.description, available: loaded.tools.length > 0, reason: loaded.reason, tools: loaded.tools.length, writeTools: loaded.tools.filter((t) => t.write).length });
  }

  const contents = opts.contents;
  const declarations = [...tools.values()].map((t) => ({ name: t.name, description: t.description, ...(t.parameters ? { parameters: t.parameters } : {}) }));
  const latestUserQuery = [...contents].reverse()
    .find((item) => item.role === "user")
    ?.parts.filter((part) => typeof part.text === "string").map((part) => part.text!).join("\n")
    .slice(-8000) ?? "";
  const thinkingMode = resolveThinkingMode(latestUserQuery, opts.thinkingMode);
  // Les spécialistes sont de vrais appels modèle indépendants, consultatifs et sans outils.
  let specialistContext = "";
  if (thinkingMode === "deep" || thinkingMode === "expert") {
    const specialistModel = process.env.GEMINI_REASONING_MODEL || process.env.GEMINI_EXPERT_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const specialistFallback = process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
    const reviews = await runSpecialistReviews({
      apiKey: opts.apiKey,
      model: specialistModel,
      fallbackModel: specialistFallback,
      query: latestUserQuery,
      projectContext: opts.projectContext,
      history: contents,
    });
    specialistContext = formatSpecialistReviews(reviews);
    for (const review of reviews) {
      emit({ tool: `specialist_${review.specialist}`, label: `Agent IA : ${review.label}`, write: false, status: "ok" });
    }
    if (!reviews.length) {
      emit({ tool: "specialist_orchestration", label: "Agents spécialisés indisponibles — poursuite avec Bickri AI", write: false, status: "error" });
    }
  }
  // Le mode rapide évite l’appel d’embeddings/RAG avant la génération de la réponse.
  const retrieved = thinkingMode === "fast" ? [] : await retrieveKnowledge(latestUserQuery, 5);
  // La mémoire n'est chargée que pour l'utilisateur connecté et reste strictement limitée à son compte.
  let authorizedMemory = "";
  if (opts.ctx.user && opts.ctx.supabase) {
    try {
      const { data: memories, error } = await opts.ctx.supabase
        .from("bcx_ai_memories")
        .select("title,content,category,updated_at")
        .eq("user_id", opts.ctx.user.id)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (!error && Array.isArray(memories)) {
        const stopWords = new Set(["avec", "dans", "pour", "mais", "donc", "cette", "cela", "comment", "pourquoi", "faire", "fait", "veux", "mon", "mes", "une", "des", "les", "the", "and", "that", "this", "from", "your"]);
        const queryTerms = latestUserQuery.toLocaleLowerCase("fr").normalize("NFD")
          .replace(/\p{M}/gu, "").match(/[a-z0-9]{3,}/g) ?? [];
        const terms = [...new Set(queryTerms.filter((term) => !stopWords.has(term)))].slice(0, 24);
        const ranked = memories.map((memory: { title?: string; content?: string; category?: string; updated_at?: string }) => {
          const title = String(memory.title || "").toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
          const content = String(memory.content || "").toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
          const category = String(memory.category || "general").toLocaleLowerCase("fr");
          const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 3 : 0) + (content.includes(term) ? 1 : 0) + (category.includes(term) ? 0.5 : 0), 0);
          const updatedAt = memory.updated_at ? Date.parse(memory.updated_at) : Number.NaN;
          const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86_400_000) : 365;
          return { memory, score, recency: Math.max(0, 365 - ageDays) };
        }).sort((a, b) => b.score - a.score || b.recency - a.recency);
        const selected = ranked.filter((item) => item.score > 0).slice(0, 8);
        const fallback = selected.length ? selected : ranked.slice(0, 3);
        authorizedMemory = fallback.map(({ memory }) =>
          `[${String(memory.category || "general").slice(0, 40)} | mise à jour : ${String(memory.updated_at || "date inconnue").slice(0, 10)}] ${String(memory.title || "").slice(0, 120)}: ${String(memory.content || "").slice(0, 1200)}`)
          .join("\n")
          .slice(0, 10000);
      } else if (error) {
        console.error("BCX memory context read failed", error.code);
      }
    } catch (error) {
      console.error("BCX memory context unavailable", error instanceof Error ? error.message : "unknown");
    }
  }
  // Recherche Web automatique pour les demandes explicites ou les sujets d'actualité.
  // Elle ne dépend pas de l'activation manuelle du plugin dans l'interface.
  let webContext = "";
  let sources: AgentResult["sources"] = [];
  if (opts.researchMode || shouldSearchWeb(latestUserQuery)) {
    emit({ tool: "web_search_started", label: "Recherche Web en cours", write: false, status: "pending" });
    try {
      const webResults = await searchWeb(latestUserQuery, opts.researchMode ? 8 : 6);
      const opened = await Promise.all(webResults.slice(0, opts.researchMode ? 5 : 3).map(async (item) => {
        try {
          const page = await fetchPublic(item.url);
          return { item, page };
        } catch {
          return { item, page: null };
        }
      }));
      sources = webResults.map((item) => {
        const page = opened.find((entry) => entry.item.url === item.url)?.page;
        return {
          title: page && "title" in page && typeof page.title === "string" ? page.title : item.title,
          url: item.url,
          snippet: page && "content" in page && typeof page.content === "string"
            ? page.content.slice(0, 900)
            : item.snippet,
          provider: item.source,
          opened: Boolean(page && "content" in page && typeof page.content === "string" && page.status >= 200 && page.status < 400),
          ...(page && "status" in page ? { status: page.status } : {}),
        };
      });
      const pageContext = opened.flatMap(({ item, page }) =>
        page && "content" in page && typeof page.content === "string" && page.status >= 200 && page.status < 400
          ? [`[PAGE LUE — ${page.title || item.title}]\nURL : ${page.url}\nContenu : ${page.content.slice(0, 12000)}`]
          : []
      ).join("\n\n");
      webContext = [
        formatWebSearchResults(webResults),
        pageContext ? `CONTENU DES PAGES OUVERTES :\n${pageContext}` : "",
      ].filter(Boolean).join("\n\n");
      emit({ tool: "web_search", label: `${webResults.length} résultats Web trouvés`, write: false, status: webResults.length ? "ok" : "error" });
      if (opened.length) emit({ tool: "web_open", label: `${opened.filter((entry) => entry.page && "content" in entry.page && entry.page.status >= 200 && entry.page.status < 400).length} pages Web ouvertes`, write: false, status: "ok" });
    } catch (error) {
      console.warn("BCX automatic web search unavailable:", error instanceof Error ? error.message : "unknown");
      emit({ tool: "web_search", label: "Recherche Web indisponible", write: false, status: "error" });
    }
  }
  const system = buildSystemInstruction(
    opts.language,
    opts.projectContext,
    [...tools.keys()],
    latestUserQuery,
    formatRetrievedKnowledge(retrieved),
    authorizedMemory,
  ) + getThinkingInstruction(thinkingMode) + (specialistContext ? `\n\n${specialistContext}` : "") + (webContext ? `\n\nRECHERCHE WEB — SOURCES À UTILISER :\n${webContext}\n\nConsignes : réponds à la question en t’appuyant sur ces résultats, distingue les faits confirmés des éléments incertains et ajoute les URL des sources pertinentes dans ta réponse. Ne prétends pas avoir consulté une page au-delà de son extrait fourni.` : "");
  let model: string | undefined;

  try {
    // Reprise après une validation : exécuter les appels en attente.
    const pendingCalls = callsOf(contents.at(-1));
    if (pendingCalls.length) {
      const allow = opts.decision === "approve" && Boolean(opts.ctx.user);
      const parts: GeminiPart[] = [];
      for (const call of pendingCalls) parts.push(await execute(call, tools, opts.ctx, allow, events, opts.onProgress));
      contents.push({ role: "user", parts });
    }

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - started > TIME_BUDGET_MS) return { contents, events, continue: true, model, plugins: statuses, sources };
      compact(contents);
      const configuredModel = process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const configuredFallback = process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
      const selectedModel = thinkingMode === "fast"
        ? process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite"
        : thinkingMode === "expert"
          ? process.env.GEMINI_EXPERT_MODEL || process.env.GEMINI_REASONING_MODEL || configuredModel
          : thinkingMode === "deep"
            ? process.env.GEMINI_REASONING_MODEL || configuredModel
            : configuredModel;
      const fallbackModel = selectedModel === configuredFallback ? "gemini-3.8-flash" : configuredFallback;
      const res = await generateContent({
        apiKey: opts.apiKey,
        model: selectedModel,
        fallbackModel,
        systemInstruction: system,
        contents,
        tools: declarations,
        timeoutMs: thinkingMode === "fast" ? 15000 : thinkingMode === "expert" ? 40000 : thinkingMode === "deep" ? 30000 : 25000,
        maxOutputTokens: thinkingMode === "fast" ? 3072 : thinkingMode === "balanced" ? 4096 : thinkingMode === "deep" ? 12288 : 16384,
        thinkingMode,
      });
      model = res.model;
      contents.push(res.content);

      const calls = callsOf(res.content);
      if (!calls.length) {
        const answer = res.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
        return { contents, events, answer: answer || "(Réponse vide.)", model, plugins: statuses, sources };
      }

      const writes = calls.filter((c) => tools.get(c.name)?.write);
      if (writes.length) {
        const pending = writes.map((c) => ({ tool: c.name, label: tools.get(c.name)!.label(c.args ?? {}), args: c.args ?? {} }));
        pending.forEach((p) => emit({ tool: p.tool, label: p.label, write: true, status: "pending" }));
        return { contents, events, pending, model, plugins: statuses, sources };
      }

      const parts: GeminiPart[] = [];
      for (const call of calls) parts.push(await execute(call, tools, opts.ctx, false, events, opts.onProgress));
      contents.push({ role: "user", parts });
    }
    return { contents, events, continue: true, model, plugins: statuses, sources };
  } finally {
    await Promise.all(closers.map((c) => c()));
  }
}
