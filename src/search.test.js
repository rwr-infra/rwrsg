/**
 * Checks for the shared search contract — see shared/search-cases.json.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { matches, normalize } from "./search.js";
import cases from "../shared/search-cases.json" with { type: "json" };

for (const { why, fields, query, expect } of cases.cases) {
  test(`${expect ? "matches" : "rejects"}: ${JSON.stringify(query)} — ${why}`, () => {
    assert.equal(matches(fields, query), expect);
  });
}

test("normalize is idempotent", () => {
  for (const { fields, query } of cases.cases) {
    for (const field of [...fields, query]) {
      const once = normalize(field);
      assert.equal(normalize(once), once, `not idempotent for ${JSON.stringify(field)}`);
    }
  }
});

test("the reported case, spelled out", () => {
  /* `Ⅲ` is U+2162; `toLowerCase()` would turn it into `ⅲ` (U+2172), which is a
   * different character and would silently stop matching. Both cases are in the
   * shared table so the fold order cannot matter. */
  assert.equal(normalize("Ⅲ型防弹背心"), "3型防弹背心");
  assert.equal(normalize("ⅲ型防弹背心"), "3型防弹背心");
  assert.equal(normalize("Vest, type III"), "vest,type3");
});
