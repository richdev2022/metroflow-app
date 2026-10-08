#!/usr/bin/env node
/**
 * find_tdz_order.mjs — static guard against render-time TDZ crashes.
 *
 * Bug class this catches (production white-screen, "Cannot access 'X' before initialization"):
 *   A useCallback/useEffect/useMemo dependency array is evaluated EAGERLY on every render.
 *   If a dep-array identifier is declared LATER in the same component scope (const/let TDZ),
 *   the very first render throws ReferenceError — dev and prod alike.
 *
 * What it checks:
 *   For every hook dep array (useCallback/useEffect/useMemo/useLayoutEffect),
 *   every identifier in the deps must be declared at or before the hook starts
 *   (component top-level scope, 2-space indent convention of this codebase),
 *   or come from imports/module scope/props (i.e. not declared later in this file).
 *
 * Zero expected output = pass. Exit 1 on any finding.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = path.join(root, "client");
const HOOK_START = /use(Callback|Effect|Memo|LayoutEffect)\s*[<(]/;
const DEP_ARRAY_END = /\}\s*,?\s*\[([^\]]*)\]\s*\)/; // }, [a, b]) style closers
const DEP_ARRAY_INLINE = /\)\s*,\s*\[([^\]]*)\]\s*\)/; // ), [a, b]) single-line style
// Component top-level scope: 2-space indent only. Deeper indents are forwardRef
// bodies or nested callbacks (false-positive territory) — vendored shadcn ui/ is
// excluded below, and the browser render smoke test covers whatever this skips.
const DECL_BRACKET = /^  const\s+\[([^\]]+)\]\s*=/;
const DECL_BRACE = /^  const\s+\{([^}]+)\}\s*=/;
const DECL_SIMPLE = /^  (?:const|let)\s+([A-Za-z_$][\w$]*)\s*[:=]/;
const KEYWORDS = new Set(["true", "false", "null", "undefined"]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) yield p;
  }
}

function declNames(line) {
  let m = line.match(DECL_BRACKET);
  if (m) return m[1].split(",").map((s) => s.trim().split(/[:=]/)[0].trim()).filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
  m = line.match(DECL_BRACE);
  if (m)
    return m[1]
      .split(",")
      .map((s) => s.trim())
      .map((s) => (s.includes(":") ? s.split(":")[1] : s).trim().split(/[:=]/)[0].trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
  m = line.match(DECL_SIMPLE);
  if (m) return [m[1]];
  return [];
}

function identsInDeps(raw) {
  const out = [];
  for (const element of raw.split(",")) {
    // strip property accesses: selectedConversation?.id -> selectedConversation
    const root = element.replace(/\?\.\s*[A-Za-z_$][\w$]*/g, "").replace(/\.\s*[A-Za-z_$][\w$]*/g, "");
    for (const id of root.split(/[^\w$]+/)) {
      if (/^[A-Za-z_$][\w$]*$/.test(id) && !KEYWORDS.has(id)) out.push(id);
    }
  }
  return out;
}

const findings = [];
for (const file of walk(CLIENT)) {
  // vendored shadcn/radix primitives use forwardRef (4-space bodies) that this
  // line-based analysis would misjudge — runtime render test covers them instead
  if (file.includes(`${path.sep}ui${path.sep}`)) continue;
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  // first declaration line per identifier at component top-level scope
  const declLine = new Map();
  lines.forEach((text, i) => {
    for (const name of declNames(text)) if (!declLine.has(name)) declLine.set(name, i + 1);
  });

  let hookStartLine = null;
  lines.forEach((text, i) => {
    const lineNo = i + 1;
    if (HOOK_START.test(text)) hookStartLine = lineNo; // nearest hook opening above the dep array
    const m = text.match(DEP_ARRAY_END) || text.match(DEP_ARRAY_INLINE);
    if (!m) return;
    const deps = identsInDeps(m[1]);
    if (!deps.length) {
      if (text.trim().startsWith("}")) hookStartLine = null;
      return;
    }
    const start = hookStartLine ?? lineNo;
    for (const dep of deps) {
      const d = declLine.get(dep);
      if (d !== undefined && d > start) {
        findings.push({ file: path.relative(root, file), line: start, dep, declaredAt: d, hookLineText: lines[start - 1].trim().slice(0, 120) });
      }
    }
    if (text.trim().startsWith("}") || /;\s*$/.test(text)) hookStartLine = null;
  });
}

if (findings.length) {
  console.error(`TDZ-ORDER: ${findings.length} finding(s) — dep-array identifiers declared later in the same scope:\n`);
  for (const f of findings)
    console.error(`  ${f.file}:${f.line}  dep '${f.dep}' is declared at line ${f.declaredAt} (after the hook)\n    hook: ${f.hookLineText}`);
  console.error("\nFix: move the state/const declaration ABOVE the hook that lists it in its dependency array.");
  process.exit(1);
}
console.log("TDZ-ORDER: OK — no hook dependency array references a later-declared binding.");
