/**
 * The one search implementation.
 *
 * The picker and the workbench both call `matches`, so a query behaves the same
 * in either. They used to roll their own — and only one of them looked at the
 * item key at all.
 *
 * The *rules* live in `shared/search-rules.json`, not here, because the same
 * matching has to be available to the build pipeline (Python, `pre-pull/`) and
 * to anything else that reads this catalog. Sharing a data file means the
 * mappings cannot drift between languages; sharing the loop was never the hard
 * part — it is five lines either way.
 *
 * The contract is pinned by `shared/search-cases.json`, which both the JS test
 * and any future Python implementation check against. See docs/ITEM-GROUPING.md.
 */
import rules from "../shared/search-rules.json" with { type: "json" };

const { cjkNumerals, asciiNumerals } = rules;

const CJK_NUMERAL_RE = new RegExp(`[${Object.keys(cjkNumerals).join("")}]`, "g");
/* `\b` so `iii` only folds as a whole token — `VII` in `VII-type` still folds,
 * but `ii` inside a word does not. */
const ASCII_NUMERAL_RE = new RegExp(
  `\\b(?:${Object.keys(asciiNumerals)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "g",
);
/* U+FF01–U+FF5E are the full-width twins of U+0021–U+007E. */
const FULLWIDTH_RE = /[\uFF01-\uFF5E]/g;
const FULLWIDTH_OFFSET = 0xfee0;

/** Fold a string into the form both sides of a comparison are reduced to. */
export function normalize(text) {
  if (text == null) return "";
  return String(text)
    /* CJK numerals first: both JS `toLowerCase()` and Python `str.lower()` turn
     * `Ⅲ` (U+2162) into `ⅲ` (U+2172), a different character. The shared table
     * lists both cases, so the fold is order-independent — but doing it before
     * the case fold keeps the intent obvious. */
    .replace(CJK_NUMERAL_RE, (c) => cjkNumerals[c])
    .replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - FULLWIDTH_OFFSET))
    .toLowerCase()
    .replace(ASCII_NUMERAL_RE, (m) => asciiNumerals[m])
    .replace(/\s+/g, "");
}

/**
 * Does any field contain the query?
 * An empty or whitespace-only query matches everything.
 *
 * @param {Array<string|null|undefined>} fields
 * @param {string} query
 */
export function matches(fields, query) {
  const q = normalize(query);
  if (!q) return true;
  return fields.some((field) => normalize(field).includes(q));
}
