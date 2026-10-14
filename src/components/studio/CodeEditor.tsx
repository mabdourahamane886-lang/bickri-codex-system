"use client";

import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { useMemo } from "react";
import type { FileKey } from "@/lib/studio/templates";

/** Thème qui suit les variables CSS de BCX (fonctionne en sombre et en clair). */
const bcxTheme = EditorView.theme({
  "&": { backgroundColor: "var(--bg)", color: "var(--text)", height: "100%" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent)", padding: "12px 0" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--text-faint)", border: "none", borderRight: "1px solid var(--border)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-3) 55%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-muted)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-ring) !important" },
  ".cm-matchingBracket": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent-ring)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--surface-3)", border: "none", color: "var(--text-muted)" },
  ".cm-tooltip": { backgroundColor: "var(--surface-3)", border: "1px solid var(--border-strong)", color: "var(--text)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
});

const bcxHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: "#c792ea" },
  { tag: [t.tagName], color: "#f07178" },
  { tag: [t.attributeName, t.propertyName], color: "#82aaff" },
  { tag: [t.string, t.special(t.string), t.attributeValue], color: "#a5d6a7" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#f5a97f" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--text-faint)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#5ad8e6" },
  { tag: [t.className, t.typeName], color: "#e2bf6d" },
  { tag: [t.operator, t.punctuation, t.bracket, t.angleBracket], color: "var(--text-muted)" },
  { tag: [t.unit, t.color], color: "#f5a97f" },
]);

export default function CodeEditor({ file, value, onChange, onCursor }: { file: FileKey; value: string; onChange: (v: string) => void; onCursor?: (line: number, col: number) => void }) {
  const extensions = useMemo(() => [
    file === "html" ? html() : file === "css" ? css() : javascript(),
    bcxTheme,
    syntaxHighlighting(bcxHighlight),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (!onCursor || !u.selectionSet) return;
      const pos = u.state.selection.main.head;
      const line = u.state.doc.lineAt(pos);
      onCursor(line.number, pos - line.from + 1);
    }),
  ], [file, onCursor]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      height="100%"
      style={{ height: "100%" }}
      basicSetup={{ foldGutter: true, highlightActiveLine: true, autocompletion: true, bracketMatching: true, closeBrackets: true, tabSize: 2 }}
      aria-label="Éditeur de code"
    />
  );
}
