import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { makeZip } from "@/lib/documents/zip";
import { recordAIUsage } from "@/lib/ai/telemetry";

export const runtime = "nodejs";

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function paragraphs(markdown: string) {
  return markdown.slice(0, 100000).split(/\r?\n/).map((line) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) return `<w:p><w:pPr><w:pStyle w:val="Heading${heading[1].length}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(heading[2])}</w:t></w:r></w:p>`;
    if (/^[-*]\s+/.test(line)) return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:t xml:space="preserve">• ${esc(line.slice(2))}</w:t></w:r></w:p>`;
    if (!line.trim()) return "<w:p/>";
    return `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`;
  }).join("");
}
function makeDocx(title: string, content: string) {
  const body = paragraphs(content);
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${esc(title)}</w:t></w:r></w:p>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  return makeZip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/document.xml", data: xml },
  ]);
}
export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-doc-export:${clientKey(request.headers)}`, 15, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop d'exports. Réessaie plus tard." }, { status: 429 });
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase n'est pas configuré." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour exporter un document." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "Document Bickri AI";
  const content = typeof body.content === "string" ? body.content : "";
  const format = body.format === "docx" ? "docx" : body.format === "html" ? "html" : body.format === "txt" ? "txt" : "md";
  if (!content.trim() || content.length > 100000) return NextResponse.json({ error: "Le contenu doit contenir entre 1 et 100 000 caractères." }, { status: 400 });
  const safe = title.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "document";
  await recordAIUsage({ userId: user.id, capability: "document_export", provider: "BCX", outcome: "success" });
  if (format === "docx") {
    const data = makeDocx(title, content);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${safe}.docx"`, "Cache-Control": "no-store" } });
  }
  if (format === "html") {
    const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:16px/1.65 system-ui;max-width:850px;margin:48px auto;padding:0 24px;color:#172033}h1,h2,h3{line-height:1.2} @media print{body{margin:0;max-width:none}}</style><h1>${esc(title)}</h1><pre style="white-space:pre-wrap;font:inherit">${esc(content)}</pre></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.html"`, "Cache-Control": "no-store" } });
  }
  return new NextResponse(content, { headers: { "Content-Type": format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.${format}"`, "Cache-Control": "no-store" } });
}
