import { NextRequest, NextResponse } from "next/server";
import { readZip } from "@/lib/documents/zip";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { generateContent } from "@/lib/ai/gemini-raw";
import { recordAIUsage } from "@/lib/ai/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

function xmlText(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1;
}
function parseWorkbook(buffer: Buffer) {
  const files = readZip(buffer, 120);
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlText(x[1])).join(""));
  const sheetFiles = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort();
  if (!sheetFiles.length) throw new Error("Aucune feuille Excel lisible n'a été trouvée.");
  const sheets = sheetFiles.slice(0, 8).map((name) => {
    const xml = files.get(name)!.toString("utf8");
    const rows: unknown[][] = [];
    let formulaCount = 0;
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= 12000) break;
      const row: unknown[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1], body = cellMatch[2];
        const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? "A1";
        const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const formula = body.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];
        if (formula !== undefined) formulaCount++;
        let value: unknown = raw;
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");
        else if (type === "b") value = raw === "1";
        else if (raw !== "" && Number.isFinite(Number(raw))) value = Number(raw);
        row[columnIndex(ref)] = value;
      }
      rows.push(row);
    }
    const width = Math.min(60, Math.max(0, ...rows.map((r) => r.length)));
    const normalized = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
    const header = (normalized[0] ?? []).map((v, i) => String(v ?? "").trim() || `Colonne ${i + 1}`);
    const records = normalized.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
    const columns = header.map((h, i) => {
      const values = records.map((r) => r[h]).filter((v) => v !== null && v !== "");
      const numeric = values.filter((v) => typeof v === "number") as number[];
      return { name: h, nonEmpty: values.length, empty: records.length - values.length,
        numericCount: numeric.length, sum: numeric.reduce((a, b) => a + b, 0),
        average: numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null,
        min: numeric.length ? Math.min(...numeric) : null, max: numeric.length ? Math.max(...numeric) : null };
    });
    return { name: name.split("/").pop(), rows: records.length, columns: header.length, formulaCount, header, columnsSummary: columns, preview: records.slice(0, 20) };
  });
  return { sheets, totalRows: sheets.reduce((n, s) => n + s.rows, 0), totalSheets: sheets.length };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const limit = rateLimit(`ai-xlsx:${clientKey(request.headers)}`, 8, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop d'analyses. Réessaie dans un instant." }, { status: 429 });
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase n'est pas configuré." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour analyser un classeur." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
  const filename = typeof body.filename === "string" ? body.filename.slice(0, 180) : "classeur.xlsx";
  const encoded = typeof body.fileData === "string" ? body.fileData : "";
  if (!/\.xlsx$/i.test(filename) || !encoded || encoded.length > 4_200_000) return NextResponse.json({ error: "Fournis un classeur Excel .xlsx de moins de 3 Mo." }, { status: 400 });
  let report: ReturnType<typeof parseWorkbook>;
  try { report = parseWorkbook(Buffer.from(encoded.replace(/^data:[^,]+,/, ""), "base64")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Classeur illisible." }, { status: 422 }); }
  const question = typeof body.question === "string" ? body.question.slice(0, 3000) : "Analyse ce classeur : tendances, anomalies, indicateurs clés et recommandations.";
  let analysis = "Analyse statistique locale terminée. Le résumé IA Gemini n'est pas configuré.";
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (apiKey) {
    try {
      const result = await generateContent({ apiKey, model: process.env.GEMINI_MODEL || "gemini-2.5-flash", fallbackModel: "gemini-2.5-flash-lite",
        systemInstruction: "Tu es un analyste de données. Analyse uniquement les données fournies, indique les limites, n'invente aucun chiffre et réponds en français.",
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ question, report }).slice(0, 90000) }] }],
        maxOutputTokens: 5000, timeoutMs: 30000 });
      analysis = result.content.parts.map((p) => p.text ?? "").join("\n").slice(0, 16000);
    } catch { analysis = "Les statistiques sont disponibles, mais Gemini n'a pas pu terminer l'analyse IA."; }
  }
  await recordAIUsage({ userId: user.id, capability: "spreadsheet_analysis", provider: apiKey ? "Gemini" : "local", outcome: "success", latencyMs: Date.now() - startedAt });
  return NextResponse.json({ filename, report, analysis, model: apiKey ? "Gemini" : null }, { headers: { "Cache-Control": "no-store" } });
}
