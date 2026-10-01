import type { ReactNode } from "react";

/**
 * WhatsApp-style inline text styling for chat messages.
 *
 * Supported markers (WhatsApp/Telegram conventions):
 *   *bold*        _italic_        ~strikethrough~        `monospace`
 *
 * Parsing rules (matching WhatsApp closely enough for chat):
 *  - markers must wrap non-empty content and not be adjacent to whitespace
 *    on the inner side (e.g. "* bold *" is NOT bold);
 *  - `code` spans win over other markers inside them (no nesting inside code);
 *  - formatting does not nest (first marker wins) — chat, not a document editor;
 *  - everything else renders as plain text, whitespace fully preserved.
 *
 * The returned nodes are inline elements — the consumer wraps them in a
 * whitespace-pre-wrap container so newlines keep working.
 */

type Token = { kind: "text" | "bold" | "italic" | "strike" | "code"; text: string };

const MARKERS: Array<{ kind: Token["kind"]; ch: string }> = [
  { kind: "bold", ch: "*" },
  { kind: "italic", ch: "_" },
  { kind: "strike", ch: "~" },
  { kind: "code", ch: "`" },
];

function findClose(src: string, marker: string, from: number): number {
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "\n" && marker !== "`") {
      // WhatsApp keeps bold/italic within a line; code spans may cross lines.
      return -1;
    }
    if (c === marker) {
      // inner char must exist and not be a space right before the closing mark
      if (i > from && src[i - 1] !== " ") return i;
    }
  }
  return -1;
}

/** Tokenize a run of text that is known to contain no code spans. */
function tokenizeStyled(src: string): Token[] {
  const tokens: Token[] = [];
  let plain = "";
  let i = 0;
  const flush = () => {
    if (plain) {
      tokens.push({ kind: "text", text: plain });
      plain = "";
    }
  };
  while (i < src.length) {
    const c = src[i];
    const marker = MARKERS.find((m) => m.ch === c);
    const opens = marker && i + 1 < src.length && src[i + 1] !== " " && src[i + 1] !== c;
    if (marker && opens) {
      const close = findClose(src, marker.ch, i + 1);
      if (close > -1) {
        flush();
        tokens.push({ kind: marker.kind, text: src.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    plain += c;
    i++;
  }
  flush();
  return tokens;
}

/**
 * Split into code / non-code segments first (code wins), then style the rest.
 */
export function parseStyledText(content: string): Token[] {
  const tokens: Token[] = [];
  const codeRe = /`([^`\n]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(content))) {
    if (m.index > last) tokens.push(...tokenizeStyled(content.slice(last, m.index)));
    tokens.push({ kind: "code", text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < content.length) tokens.push(...tokenizeStyled(content.slice(last)));
  return tokens;
}

/** Render styled text to inline React nodes (caller supplies the wrapper). */
export function renderStyledText(content: string, keyPrefix = "st"): ReactNode[] {
  const tokens = parseStyledText(content || "");
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.kind) {
      case "bold":
        return (
          <strong key={key} className="font-semibold">
            {t.text}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {t.text}
          </em>
        );
      case "strike":
        return (
          <span key={key} className="line-through opacity-90">
            {t.text}
          </span>
        );
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-black/15 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/15"
          >
            {t.text}
          </code>
        );
      default:
        return <span key={key}>{t.text}</span>;
    }
  });
}

/**
 * WhatsApp composer formatting: wrap the textarea's current selection in the
 * given marker (or insert an empty pair when nothing is selected) and return
 * the next {value, selectionStart, selectionEnd} for controlled state.
 */
export function wrapSelectionWithMarker(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const hasSelection = selEnd > selStart;
  const before = value.slice(0, selStart);
  const inner = hasSelection ? value.slice(selStart, selEnd) : "";
  const after = value.slice(hasSelection ? selEnd : selStart);
  // Toggle off when the selection is already wrapped by this marker.
  if (hasSelection && before.endsWith(marker) && after.startsWith(marker)) {
    const nextValue = before.slice(0, before.length - marker.length) + inner + after.slice(marker.length);
    return {
      value: nextValue,
      selectionStart: selStart - marker.length,
      selectionEnd: selEnd - marker.length,
    };
  }
  const nextValue = `${before}${marker}${inner}${marker}${after}`;
  return {
    value: nextValue,
    selectionStart: selStart + marker.length,
    selectionEnd: selStart + marker.length + inner.length,
  };
}
