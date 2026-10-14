import "server-only";
import { generateContent, type GeminiContent, type GeminiPart } from "@/lib/ai/gemini-raw";
import { buildSystemInstruction } from "@/lib/ai/prompt";
import { PLUGINS } from "./plugins";
import type { AgentContext, PluginStatus, Tool } from "./types";

export type AgentEvent = { tool: string; label: string; write: boolean; status: "ok" | "error" | "refused" | "pending" };
export type AgentResult = {
  contents: GeminiContent[];
  events: AgentEvent[];
  answer?: string;
  pending?: { tool: string; label: string; args: Record<string, unknown> }[];
  continue?: boolean;
  model?: string;
  plugins: PluginStatus[];
};

const MAX_STEPS = 12;
const TIME_BUDGET_MS = 48_000;
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

async function execute(call: NonNullable<GeminiPart["functionCall"]>, tools: Map<string, Tool>, ctx: AgentContext, allowWrite: boolean, events: AgentEvent[]): Promise<GeminiPart> {
  const tool = tools.get(call.name);
  const args = call.args ?? {};
  const respond = (response: Record<string, unknown>): GeminiPart => ({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
  if (!tool) { events.push({ tool: call.name, label: call.name, write: false, status: "error" }); return respond({ error: "Outil indisponible : le plugin est désactivé ou non autorisé." }); }
  const label = tool.label(args);
  if (tool.write && !allowWrite) { events.push({ tool: call.name, label, write: true, status: "refused" }); return respond({ error: "L'utilisateur a refusé cette action. Ne la relance pas sans nouvelle demande." }); }
  try {
    const out = (await tool.run(args, ctx)) as Record<string, unknown>;
    const failed = Boolean(out && typeof out === "object" && "error" in out);
    events.push({ tool: call.name, label, write: tool.write, status: failed ? "error" : "ok" });
    return respond(out && typeof out === "object" ? out : { result: out });
  } catch (err) {
    events.push({ tool: call.name, label, write: tool.write, status: "error" });
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
}): Promise<AgentResult> {
  const started = Date.now();
  const events: AgentEvent[] = [];
  const tools = new Map<string, Tool>();
  const closers: Array<() => Promise<void>> = [];
  const statuses: PluginStatus[] = [];

  for (const plugin of PLUGINS) {
    if (!opts.pluginIds.includes(plugin.id)) { statuses.push({ id: plugin.id, name: plugin.name, description: plugin.description, available: false, reason: "Désactivé", tools: 0, writeTools: 0 }); continue; }
    const loaded = await plugin.load(opts.ctx);
    loaded.tools.forEach((t) => tools.set(t.name, t));
    if (loaded.close) closers.push(loaded.close);
    statuses.push({ id: plugin.id, name: plugin.name, description: plugin.description, available: loaded.tools.length > 0, reason: loaded.reason, tools: loaded.tools.length, writeTools: loaded.tools.filter((t) => t.write).length });
  }

  const contents = opts.contents;
  const declarations = [...tools.values()].map((t) => ({ name: t.name, description: t.description, ...(t.parameters ? { parameters: t.parameters } : {}) }));
  const system = buildSystemInstruction(opts.language, opts.projectContext, [...tools.keys()]);
  let model: string | undefined;

  try {
    // Reprise après une validation : exécuter les appels en attente.
    const pendingCalls = callsOf(contents.at(-1));
    if (pendingCalls.length) {
      const allow = opts.decision === "approve" && Boolean(opts.ctx.user);
      const parts: GeminiPart[] = [];
      for (const call of pendingCalls) parts.push(await execute(call, tools, opts.ctx, allow, events));
      contents.push({ role: "user", parts });
    }

    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - started > TIME_BUDGET_MS) return { contents, events, continue: true, model, plugins: statuses };
      compact(contents);
      const res = await generateContent({ apiKey: opts.apiKey, model: process.env.GEMINI_MODEL || "gemini-3.8-flash", fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash", systemInstruction: system, contents, tools: declarations });
      model = res.model;
      contents.push(res.content);

      const calls = callsOf(res.content);
      if (!calls.length) {
        const answer = res.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
        return { contents, events, answer: answer || "(Réponse vide.)", model, plugins: statuses };
      }

      const writes = calls.filter((c) => tools.get(c.name)?.write);
      if (writes.length) {
        const pending = writes.map((c) => ({ tool: c.name, label: tools.get(c.name)!.label(c.args ?? {}), args: c.args ?? {} }));
        pending.forEach((p) => events.push({ tool: p.tool, label: p.label, write: true, status: "pending" }));
        return { contents, events, pending, model, plugins: statuses };
      }

      const parts: GeminiPart[] = [];
      for (const call of calls) parts.push(await execute(call, tools, opts.ctx, false, events));
      contents.push({ role: "user", parts });
    }
    return { contents, events, continue: true, model, plugins: statuses };
  } finally {
    await Promise.all(closers.map((c) => c()));
  }
}
