#!/usr/bin/env node
/**
 * i18n audit — run with `npm run check`.
 *
 * rwrsg advertises English, but nothing enforced it. The entire export step was
 * hardcoded Chinese: an English visitor got Chinese labels for the width, the
 * discount and all eight display switches, and nothing failed. The two locale
 * files had also drifted apart, so a key present in one was simply missing in
 * the other.
 *
 * Two checks, both cheap:
 *
 *   1. The locale files carry exactly the same key set.
 *   2. Every `t("literal")` in `src/` names a key that exists.
 *
 * Dynamic lookups (`t(`stance.${key}`)`) are skipped — the stance list is
 * checked as a whole by the key set, since all its members live in the locale
 * files.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCALES = ["zh-CN", "en-US"];
const SRC = join(ROOT, "src");

/** `{a: {b: 1}}` → `["a.b"]` */
function flatten(value, prefix = "") {
  const out = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") out.push(...flatten(child, path));
    else out.push(path);
  }
  return out;
}

function readLocale(name) {
  return JSON.parse(readFileSync(join(ROOT, "src/locales", name, "trans.json"), "utf8"));
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/* `t("a.b")` and `t('a.b')` only. A backtick is almost always interpolation. */
const LITERAL_T = /\bt\(\s*["']([A-Za-z0-9_.]+)["']/g;

const problems = [];

const locales = Object.fromEntries(LOCALES.map((name) => [name, new Set(flatten(readLocale(name)))]));

const [first, ...rest] = LOCALES;
for (const name of rest) {
  const onlyHere = [...locales[first]].filter((k) => !locales[name].has(k));
  const onlyThere = [...locales[name]].filter((k) => !locales[first].has(k));
  if (onlyHere.length) problems.push(`${name} is missing: ${onlyHere.join(", ")}`);
  if (onlyThere.length) problems.push(`${name} has extra keys: ${onlyThere.join(", ")}`);
}

const known = locales[first];
const used = new Map(); // key → Set(files)

for (const file of walk(SRC)) {
  if (file.endsWith(".test.js")) continue;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(LITERAL_T)) {
    const key = match[1];
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(relative(ROOT, file));
  }
}

for (const [key, files] of used) {
  if (!known.has(key)) {
    problems.push(`unknown key "${key}" used in ${[...files].join(", ")}`);
  }
}

/* The reverse direction is informational only: keys reachable through a
 * template literal cannot be found by a literal scan, so "unused" is not
 * necessarily dead. Report it without failing. */
const unused = [...known].filter((k) => !used.has(k)).sort();

console.log(`locales: ${LOCALES.join(", ")} — ${known.size} keys each`);
console.log(`literal t() lookups: ${used.size}`);

if (problems.length) {
  console.error("\ni18n problems:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (unused.length) {
  console.log(`note: ${unused.length} key(s) not referenced by a literal t(): ${unused.join(", ")}`);
}
console.log("i18n OK");
