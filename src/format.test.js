/**
 * Checks for the exported-picture number formatting.
 *
 * The old version lived inline in `App.jsx` where nothing could reach it, and
 * its "avoid scientific notation" branch called `toLocaleString("fullwide", …)`
 * — `"fullwide"` is a numbering system, not a locale, so the branch was both
 * unreachable and wrong. These pin the behaviour that actually ships.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { unitTrans } from "./format.js";

test("below 1000 the number is unchanged, with no suffix", () => {
  assert.equal(unitTrans(0), "0");
  assert.equal(unitTrans(1), "1");
  assert.equal(unitTrans(999), "999");
});

test("each magnitude gets its suffix", () => {
  assert.equal(unitTrans(1000), "1k");
  assert.equal(unitTrans(1e6), "1m");
  assert.equal(unitTrans(1e9), "1b");
  assert.equal(unitTrans(1e12), "1t");
});

test("the decimals are kept, not rounded away", () => {
  /* A stall price is often a round number after a discount; showing `1k` for
   * `1234` would misstate it by a quarter. */
  assert.equal(unitTrans(1234), "1.234k");
  assert.equal(unitTrans(1500), "1.5k");
  assert.equal(unitTrans(1234567), "1.234567m");
});

test("the sign is preserved", () => {
  assert.equal(unitTrans(-2500), "-2.5k");
  assert.equal(unitTrans(-999), "-999");
});

test("a numeric string works, because the call site passes toFixed()", () => {
  /* `(price * (1 - discount)).toFixed(0)` is a string, and it always was. */
  assert.equal(unitTrans("1234"), "1.234k");
  assert.equal(unitTrans("999"), "999");
});

test("nothing non-finite ever renders as NaN rp", () => {
  assert.equal(unitTrans(NaN), "0");
  assert.equal(unitTrans(Infinity), "0");
  assert.equal(unitTrans(-Infinity), "0");
  assert.equal(unitTrans(undefined), "0");
  assert.equal(unitTrans("not a number"), "0");
});

test("dividing down first keeps the result out of scientific notation", () => {
  /* The whole point of the scale step: `1e21` would print as `1e+21`. */
  const out = unitTrans(1e21);
  assert.ok(!out.includes("e"), `unexpected scientific notation: ${out}`);
  assert.equal(out, "1000000000t");
});
