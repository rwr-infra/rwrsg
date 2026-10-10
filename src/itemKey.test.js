/**
 * Checks for the record-key helpers.
 *
 * These look trivial enough to skip, which is exactly why they were written out
 * by hand in three files and drifted. `hudIconFromPath` in particular is the
 * only bridge between an online record and a bundled PNG: get it wrong and
 * every remotely-fetched item silently stops rendering.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { hudIconFromPath, isSellableType, keyNamesIcon, typeOfKey } from "./itemKey.js";

/* ── typeOfKey ────────────────────────────────────────────────────────────── */

test("the type is the segment after the last dot", () => {
  assert.equal(typeOfKey("aav7_gl.weapon"), "weapon");
  assert.equal(typeOfKey("vest3.carry_item"), "carry_item");
  assert.equal(typeOfKey("gp25.projectile"), "projectile");
});

test("the last dot wins, not the first", () => {
  assert.equal(typeOfKey("a.b.c"), "c");
});

test("a key with no type segment has none", () => {
  assert.equal(typeOfKey("aug"), null);
  assert.equal(typeOfKey(".weapon"), null, "a leading dot is not a type");
  assert.equal(typeOfKey(""), null);
  assert.equal(typeOfKey(null), null);
  assert.equal(typeOfKey(undefined), null);
});

/* ── isSellableType ───────────────────────────────────────────────────────── */

test("only the three sellable types pass", () => {
  for (const type of ["weapon", "carry_item", "projectile"]) {
    assert.equal(isSellableType(type), true, type);
  }
});

test("everything else is rejected", () => {
  for (const type of ["map_config", "faction", "vehicle", "achievement", "WEAPON", "", null, undefined]) {
    assert.equal(isSellableType(type), false, String(type));
  }
});

/* ── keyNamesIcon ─────────────────────────────────────────────────────────── */

test("the key that names an icon is the one with a matching stem", () => {
  assert.equal(keyNamesIcon("vest3.carry_item", "vest3"), true);
  assert.equal(keyNamesIcon("ac556.weapon", "ac556"), true);
  assert.equal(keyNamesIcon("aav7_gl.weapon", "aav7_gl"), true);
});

test("a record that merely shares the icon does not name it", () => {
  /* 35 records use the `vest3` sprite; only one of them is named by it. */
  assert.equal(keyNamesIcon("bunny_cub_event.carry_item", "vest3"), false);
  assert.equal(keyNamesIcon("vest3_zombie.carry_item", "vest3"), false);
  assert.equal(keyNamesIcon("grinch_10", "vest_hole1"), false);
});

test("a key with no type can never name an icon", () => {
  assert.equal(keyNamesIcon("vest3", "vest3"), false);
  assert.equal(keyNamesIcon("", "vest3"), false);
  assert.equal(keyNamesIcon("vest3.carry_item", ""), false);
  assert.equal(keyNamesIcon(null, "vest3"), false);
  assert.equal(keyNamesIcon("vest3.carry_item", null), false);
});

/* ── hudIconFromPath ──────────────────────────────────────────────────────── */

test("the hud_ prefix and the extension are stripped", () => {
  assert.equal(hudIconFromPath("textures/hud_ac556.png"), "ac556");
  assert.equal(hudIconFromPath("textures/hud_vest3.png"), "vest3");
});

test("the name is taken from the basename, not the directory", () => {
  assert.equal(hudIconFromPath("maps/map1/hud_ac556.png"), "ac556");
  assert.equal(hudIconFromPath("hud_ac556.png"), "ac556", "no directory at all");
});

test("Windows separators work too", () => {
  assert.equal(hudIconFromPath("textures\\hud_ac556.png"), "ac556");
});

test("the prefix is matched case-insensitively but the name keeps its case", () => {
  /* The game ships a few HUD_-cased paths; the icon name itself is significant
   * and must not be lowercased, because the bundled PNGs are case-sensitive. */
  assert.equal(hudIconFromPath("textures/HUD_AC556.png"), "AC556");
  assert.equal(hudIconFromPath("textures/Hud_Ac556.PNG"), "Ac556");
});

test("a path with no hud_ prefix is used as-is", () => {
  assert.equal(hudIconFromPath("textures/ac556.png"), "ac556");
});

test("nothing usable returns null, never an empty string", () => {
  assert.equal(hudIconFromPath(""), null);
  assert.equal(hudIconFromPath(null), null);
  assert.equal(hudIconFromPath(undefined), null);
  assert.equal(hudIconFromPath("textures/.png"), null);
  /* `hud_.png` strips down to "", which is falsy but is not null — a caller
   * checking `=== null` would have missed it. */
  assert.equal(hudIconFromPath("textures/hud_.png"), null);
});
