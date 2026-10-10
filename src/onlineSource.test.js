/**
 * Checks for the wiki deep link.
 *
 * Every stall row and every catalog row links to the item's article on rwrops,
 * so this URL is the one piece of cross-site contract in the app. It also used
 * to be a fourth hand-rolled copy of "parse the type out of the key".
 *
 * Importing the module is safe outside a browser: its `localStorage` reads are
 * guarded, so the store simply falls back to its defaults.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { wikiUrl } from "./onlineSource.js";

const ORIGIN = "https://rwrops.b.rwr-infra.uk";

test("a record key becomes a type-scoped article path", () => {
  assert.equal(wikiUrl("ac556.weapon"), `${ORIGIN}/params/weapon/ac556.weapon`);
  assert.equal(wikiUrl("vest3.carry_item"), `${ORIGIN}/params/carry_item/vest3.carry_item`);
  assert.equal(wikiUrl("gp25.projectile"), `${ORIGIN}/params/projectile/gp25.projectile`);
});

test("the package is carried as a query parameter", () => {
  assert.equal(
    wikiUrl("ac556.weapon", "vanilla"),
    `${ORIGIN}/params/weapon/ac556.weapon?pkg=vanilla`,
  );
});

test("no package means no query string, not an empty one", () => {
  assert.ok(!wikiUrl("ac556.weapon", "").includes("?"));
  assert.ok(!wikiUrl("ac556.weapon", null).includes("?"));
  assert.ok(!wikiUrl("ac556.weapon", undefined).includes("?"));
});

test("a key with no type has no article", () => {
  /* A legacy row can hold a bare hud icon (`aug`); there is nothing to link to. */
  assert.equal(wikiUrl("aug"), null);
  assert.equal(wikiUrl(""), null);
  assert.equal(wikiUrl(null), null);
  assert.equal(wikiUrl(undefined), null);
});

test("both segments are percent-encoded", () => {
  assert.equal(
    wikiUrl("a b.weapon", "my pack"),
    `${ORIGIN}/params/weapon/a%20b.weapon?pkg=my%20pack`,
  );
});

test("a package name that could break out of the path is encoded", () => {
  const url = wikiUrl("ac556.weapon", "a&b=c");
  assert.ok(url.includes("pkg=a%26b%3Dc"), url);
});
