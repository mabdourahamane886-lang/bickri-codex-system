/**
 * Convertit un JSON Schema (MCP) vers le sous-ensemble OpenAPI accepté par Gemini.
 */
const KEEP = new Set(["type", "format", "description", "nullable", "enum", "properties", "required", "items", "minItems", "maxItems", "minimum", "maximum"]);

export function toGeminiSchema(input: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || depth > 6) return undefined;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  let type = src.type;
  if (Array.isArray(type)) {
    if (type.includes("null")) out.nullable = true;
    type = type.find((t) => t !== "null");
  }
  if (!type) {
    const alt = (src.anyOf ?? src.oneOf) as unknown[] | undefined;
    if (Array.isArray(alt) && alt.length) return toGeminiSchema({ ...(alt.find((a) => (a as { type?: string }).type !== "null") as object), description: src.description }, depth);
    type = src.properties ? "object" : src.items ? "array" : "string";
  }
  out.type = type;

  for (const [k, v] of Object.entries(src)) {
    if (!KEEP.has(k) || k === "type") continue;
    if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        const s = toGeminiSchema(pv, depth + 1);
        if (s) props[pk] = s;
      }
      out.properties = props;
    } else if (k === "items") {
      out.items = toGeminiSchema(v, depth + 1) ?? { type: "string" };
    } else if (k === "enum" && Array.isArray(v)) {
      out.enum = v.filter((e) => typeof e === "string");
      if (!(out.enum as string[]).length) delete out.enum;
    } else if (k === "format" && !["enum", "date-time"].includes(String(v))) {
      continue;
    } else {
      out[k] = v;
    }
  }

  if (out.type === "object") {
    const props = out.properties as Record<string, unknown> | undefined;
    if (!props || !Object.keys(props).length) {
      // Gemini refuse les objets sans propriétés : on attend du JSON sous forme de texte.
      return { type: "string", description: `${str(src.description)} (objet JSON encodé en texte)`.trim() };
    }
    if (Array.isArray(out.required)) out.required = (out.required as string[]).filter((r) => r in props);
  }
  if (out.type === "array" && !out.items) out.items = { type: "string" };
  return out;
}

function str(v: unknown) { return typeof v === "string" ? v : ""; }
