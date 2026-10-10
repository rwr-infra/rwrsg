/**
 * Checks for the bundled snapshot's shape.
 *
 * `src/data.json` is hand-pulled from the game, and a lot of code assumes
 * things about it that nothing verified: that every record has an icon, that
 * the outer key and the inner `key` field agree, and that an icon does not
 * identify a record. That last one is the assumption that broke — a row saved
 * with a bare hud icon was resolved to the *first* record carrying it, which
 * for `vest3` is a bunny suit.
 *
 * These are invariants, not exact counts: the snapshot can be re-pulled, and a
 * test that fails on a legitimate refresh is a tax. The figures quoted in the
 * source comments are from the snapshot this was written against.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import bundled from "./data.json" with { type: "json" };
import { keyNamesIcon } from "./itemKey.js";

const entries = Object.entries(bundled);

/** hud icon → the record keys that carry it. */
const byIcon = {};
for (const [key, entry] of entries) {
  if (!entry.hud_icon) continue;
  (byIcon[entry.hud_icon] ||= []).push(key);
}

test("the snapshot is non-empty and every record is renderable", () => {
  assert.ok(entries.length > 0, "data.json is empty");
  for (const [key, entry] of entries) {
    assert.ok(entry.hud_icon, `${key} has no hud_icon, so it cannot render`);
  }
});

test("the outer key and the inner key field agree", () => {
  /* `convertDataToArray` keeps both as `id` and `key`, and the stall, the
   * picker and the wiki link each read a different one. */
  const disagreeing = entries.filter(([key, entry]) => entry.key !== key);
  assert.deepEqual(disagreeing.map(([key]) => key), []);
});

test("an icon identifies more than one record, so it cannot be the identity", () => {
  /* The premise of `itemKey`: 948 records behind ~510 icons. */
  assert.ok(Object.keys(byIcon).length < entries.length, "icons should be fewer than records");

  const shared = Object.entries(byIcon).filter(([, keys]) => keys.length > 1);
  assert.ok(shared.length > 0, "some icon must be shared, or the whole itemKey design is moot");

  const affected = shared.reduce((sum, [, keys]) => sum + keys.length, 0);
  assert.ok(affected > shared.length, "shared icons must cover more records than icons");
});

test("the vest3 icon resolves to vest3.carry_item, not to the first record", () => {
  /* The exact bug: 35 records reuse the vest sprite (bunny, evil commander,
   * infected ripper, pumpkin knight, …), and `vest3.carry_item` is not the
   * first of them — so "first record with this icon" picked a bunny suit. */
  const keys = byIcon.vest3;
  assert.ok(keys.length > 1, "vest3 is expected to be shared");
  assert.notEqual(
    keys[0],
    "vest3.carry_item",
    "if this is now first, the test no longer proves the ordering matters",
  );

  const named = keys.filter((key) => keyNamesIcon(key, "vest3"));
  assert.deepEqual(named, ["vest3.carry_item"]);
});

test("most shared icons still have a record that names them", () => {
  /* 38 of the 69 shared icons do. The rest are unresolvable by this rule and
   * fall back to the first record, which is the best that can be done. */
  const shared = Object.entries(byIcon).filter(([, keys]) => keys.length > 1);
  const resolvable = shared.filter(([icon, keys]) => keys.some((key) => keyNamesIcon(key, icon)));
  assert.ok(
    resolvable.length > shared.length / 3,
    `only ${resolvable.length}/${shared.length} shared icons resolve by name`,
  );
});
