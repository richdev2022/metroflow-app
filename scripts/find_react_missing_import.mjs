#!/usr/bin/env node
/**
 * find_react_missing_import.mjs — catches "ReferenceError: React is not defined".
 *
 * Under Vite's automatic JSX runtime, JSX does not need React in scope — but a
 * direct VALUE reference like React.useCallback(...) does. Type-only references
 * (React.ReactNode, React.FormEvent...) are erased at compile time and harmless.
 *
 * Method: transform each file with esbuild (same loader as the build) and look
 * for surviving `React.` references in the output. Type positions vanish; value
 * positions survive. A surviving `React.` without a React import = runtime crash.
 *
 * Requires node_modules (uses the workspace esbuild). Exit 1 on any finding.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transform } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = path.join(root, "client");

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) yield p;
  }
}

const findings = [];
for (const file of walk(CLIENT)) {
  const rel = path.relative(root, file);
  const code = fs.readFileSync(file, "utf8");
  if (!code.includes("React.")) continue; // fast path
  const loader = file.endsWith(".tsx") ? "tsx" : file.endsWith(".jsx") ? "jsx" : file.endsWith(".ts") ? "ts" : "js";
  try {
    const out = (
      await transform(code, {
        loader,
        jsx: "automatic",
        treeShaking: true,
        minify: false,
        sourcemap: false,
      })
    ).code;
    // React import (any style) present → references bind locally, fine.
    const importsReact =
      /^\s*import\s+\*?\s*as\s+React\b/m.test(code) ||
      /^\s*import\s+React\b/m.test(code) ||
      /^\s*import\s+\{[^}]*\bReact\b[^}]*\}\s+from/m.test(code) ||
      /require\(\s*["']react["']\s*\)/.test(code);
    const valueRefs = out.match(/\bReact\s*\.\s*[A-Za-z_$][\w$]*/g) || [];
    if (valueRefs.length && !importsReact) {
      findings.push({ file: rel, refs: [...new Set(valueRefs)] });
    }
  } catch (e) {
    findings.push({ file: rel, refs: [`<esbuild parse error: ${String(e.message).slice(0, 120)}>`] });
  }
}

if (findings.length) {
  console.error(`REACT-IMPORT: ${findings.length} file(s) reference React in value position WITHOUT importing it:\n`);
  for (const f of findings) console.error(`  ${f.file}\n    ${f.refs.join(", ")}`);
  console.error("\nFix: add `import React from \"react\";` or drop the React. prefix (hooks are usually already imported).");
  process.exit(1);
}
console.log("REACT-IMPORT: OK — every value-position React.* reference has React in scope.");
