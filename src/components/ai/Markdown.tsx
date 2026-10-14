"use client";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@/components/ui/CopyButton";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}

/** Rendu Markdown sûr (pas de HTML brut) avec blocs de code copiables. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => <a href={href} target="_blank" rel="noreferrer noopener">{c}</a>,
          pre: ({ children: c }) => {
            const child = Array.isArray(c) ? c[0] : c;
            const className = isValidElement(child) ? String((child as ReactElement<{ className?: string }>).props.className ?? "") : "";
            const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? "code";
            const code = textOf(child).replace(/\n$/, "");
            return (
              <div className="codeblock">
                <div className="codeblock-head"><span>{lang}</span><CopyButton value={code} /></div>
                <pre>{c}</pre>
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Extrait le premier bloc de code (optionnellement d'un langage donné). */
export function extractCodeBlock(markdown: string, languages: string[] = []): string | null {
  const blocks = [...markdown.matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  const wanted = blocks.find((b) => languages.includes(b[1].toLowerCase()));
  return (wanted ?? blocks[0])[2].replace(/\n$/, "");
}
