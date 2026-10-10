/**
 * Checks for the inventory identity rules — see docs/ITEM-GROUPING.md.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { dedupeRows, readInventory, resolveInventory, rowId } from "./inventory.js";
import {
  addInventoryRows,
  inventoryRowFor,
  parseInventoryImport,
  upsertInventoryRows,
} from "./inventory.js";

/* The real catalog is 948 records behind 510 icons; this is the smallest one
 * that still exercises every rule, including two records sharing an icon. */
const ICONS = {
  aug: true,
  aav7_turret: true,
  vest3: true,
  vest_hole1: true,
};

const catalog = {
  entries: {
    "steyr_aug.weapon": { hud_icon: "aug" },
    "aav7_gl.weapon": { hud_icon: "aav7_turret" },
    "aav7_mg.weapon": { hud_icon: "aav7_turret" },
    "vest3.carry_item": { hud_icon: "vest3" },
    "grinch_10": { hud_icon: "vest_hole1" },
  },
  iconUrl: (hud) => (ICONS[hud] ? `local://${hud}.png` : null),
  keyFor: (hud) =>
    Object.keys(catalog.entries).find((k) => catalog.entries[k].hud_icon === hud) ||
    null,
};

test("the current shape is left alone", () => {
  const row = { key: "aug", itemKey: "steyr_aug.weapon", name: "AUG", price: 250 };
  const [out] = resolveInventory([row], catalog);
  assert.equal(out, row, "an already-resolved row must not be copied");
});

test("a `<key>.<type>` key from 2025-12-29..2026-01-31 resolves", () => {
  const [out] = resolveInventory(
    [{ key: "vest3.carry_item", name: "Ⅲ型防弹背心", price: 200, num: 2 }],
    catalog,
  );
  assert.equal(out.key, "vest3", "hud icon for rendering");
  assert.equal(out.itemKey, "vest3.carry_item", "record key for identity");
  assert.equal(out.name, "Ⅲ型防弹背心");
  assert.equal(out.price, 200);
  assert.equal(out.num, 2);
});

test("a renamed record key still resolves through its icon", () => {
  /* `aug.weapon` is not in the catalog any more — it is `steyr_aug.weapon`. */
  const [out] = resolveInventory([{ key: "aug.weapon", name: "AUG" }], catalog);
  assert.equal(out.key, "aug");
  assert.equal(out.itemKey, "steyr_aug.weapon");
});

test("an unresolvable row is returned untouched", () => {
  const rows = [{ key: "does_not_exist", name: "丢失的物品", price: 999, num: 3 }];
  const out = resolveInventory(rows, catalog);
  assert.equal(out, rows, "the same array instance signals 'nothing moved'");
  assert.deepEqual(out[0], rows[0], "nothing may be dropped or renamed");
});

test("two records sharing one hud icon keep separate identities", () => {
  /* The reported bug: selecting aav7_gl lit up aav7_mg. */
  const rows = [
    { key: "aav7_turret", itemKey: "aav7_gl.weapon", name: "AAV7 GL" },
    { key: "aav7_turret", itemKey: "aav7_mg.weapon", name: "AAV7 MG" },
  ];
  const deduped = dedupeRows(rows);
  assert.equal(deduped.length, 2, "same icon must not collapse two items");
  assert.notEqual(rowId(deduped[0]), rowId(deduped[1]));
});

test("de-dupe is by identity, not by icon", () => {
  const rows = [
    { key: "aav7_turret", itemKey: "aav7_gl.weapon" },
    { key: "aav7_turret", itemKey: "aav7_gl.weapon" },
    { key: "vest3", itemKey: "vest3.carry_item" },
  ];
  assert.deepEqual(
    dedupeRows(rows).map(rowId),
    ["aav7_gl.weapon", "vest3.carry_item"],
  );
});

test("a legacy row without itemKey still de-dupes against itself", () => {
  const rows = [{ key: "does_not_exist" }, { key: "does_not_exist" }];
  assert.equal(dedupeRows(rows).length, 1);
});

test("an entry with no hud_icon does not wipe the row's key", () => {
  /* `resolveInventoryRow` spreads the entry's hud_icon over `key`. When the
   * entry had none, that wrote `key: undefined` and a row that rendered fine
   * stopped rendering. */
  const partial = {
    entries: { "noicon.weapon": {} },
    iconUrl: () => null,
    keyFor: () => null,
  };
  const row = { key: "aug", itemKey: "noicon.weapon", name: "AUG" };
  const out = resolveInventory([row], partial);
  assert.equal(out[0], row, "returned untouched rather than mangled");
  assert.equal(out[0].key, "aug");
});

test("resolving twice is a no-op the second time", () => {
  /* The home page resolves inside an effect that writes the result back to
   * storage. If resolution were not idempotent, that effect would rewrite
   * localStorage on every render, forever. */
  const once = resolveInventory([{ key: "aug.weapon", name: "AUG" }], catalog);
  const twice = resolveInventory(once, catalog);
  assert.equal(twice, once, "the same array instance means 'nothing moved'");
});

/* ── storage: the workbench's add-or-edit ─────────────────────────────────── */

/* Node has no localStorage. A Map behind the three methods the module uses is
 * enough — and stubbing is the point: it makes "did the write actually land?"
 * observable, which is the exact question this bug turned on. */
function installStorage(initial = []) {
  const store = new Map();
  if (initial.length) store.set("data", JSON.stringify(initial));
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.window = { dispatchEvent: () => true };
  return store;
}

const readStored = () =>
  JSON.parse(globalThis.localStorage.getItem("data") || "[]");

test("upsert replaces an existing row in place, keeping its position", () => {
  installStorage([
    { key: "aug", itemKey: "steyr_aug.weapon", name: "AUG", price: 180, num: 1 },
    { key: "vest3", itemKey: "vest3.carry_item", name: "Ⅲ型防弹背心", price: 150, num: 2 },
  ]);
  upsertInventoryRows([
    { key: "aug", itemKey: "steyr_aug.weapon", name: "AUG", price: 250, num: 5 },
  ]);

  const rows = readStored();
  assert.equal(rows.length, 2, "no duplicate row was appended");
  assert.equal(rows[0].price, 250, "the edited price landed");
  assert.equal(rows[0].num, 5, "the edited quantity landed");
  assert.equal(rows[0].itemKey, "steyr_aug.weapon", "and it stayed first");
  assert.equal(rows[1].itemKey, "vest3.carry_item", "the other row is untouched");
});

test("add-only cannot edit, which is why upsert exists", () => {
  /* `dedupeRows` keeps the *first* occurrence, so appending an edited row for an
   * item already in the stall silently discarded the edit — the 添加/编辑 button
   * appeared to do nothing. Pinned so the two are never confused again. */
  installStorage([{ key: "aug", itemKey: "steyr_aug.weapon", price: 180, num: 1 }]);
  addInventoryRows([{ key: "aug", itemKey: "steyr_aug.weapon", price: 250, num: 5 }]);

  const rows = readStored();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 180, "the original price survives");
});

test("upsert appends a row it has never seen", () => {
  installStorage([{ key: "aug", itemKey: "steyr_aug.weapon", price: 180, num: 1 }]);
  upsertInventoryRows([{ key: "vest3", itemKey: "vest3.carry_item", price: 150, num: 2 }]);

  const rows = readStored();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].itemKey, "vest3.carry_item", "appended after the existing row");
});

test("upsert with nothing to write leaves the stall alone", () => {
  installStorage([{ key: "aug", itemKey: "steyr_aug.weapon", price: 180, num: 1 }]);
  upsertInventoryRows([]);
  assert.equal(readStored().length, 1);
});

test("upsert matches on identity, so one of a shared icon is replaced", () => {
  /* The two AAV7 variants share the hud icon `aav7_turret`; an icon-keyed write
   * would have hit the wrong row. */
  installStorage([
    { key: "aav7_turret", itemKey: "aav7_gl.weapon", price: 100, num: 1 },
    { key: "aav7_turret", itemKey: "aav7_mg.weapon", price: 200, num: 4 },
  ]);
  upsertInventoryRows([
    { key: "aav7_turret", itemKey: "aav7_mg.weapon", price: 999, num: 7 },
  ]);

  const rows = readStored();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].num, 1, "the GL is untouched");
  assert.equal(rows[1].num, 7, "the MG was the one edited");
});

test("inventoryRowFor finds the stall row by identity, not by icon", () => {
  installStorage([
    { key: "aav7_turret", itemKey: "aav7_gl.weapon", price: 100, num: 1 },
    { key: "aav7_turret", itemKey: "aav7_mg.weapon", price: 200, num: 4 },
  ]);
  assert.equal(inventoryRowFor("aav7_mg.weapon").num, 4, "the right one of the pair");
  assert.equal(inventoryRowFor("aav7_gl.weapon").num, 1);
  assert.equal(inventoryRowFor("nothing"), null);
  assert.equal(inventoryRowFor(""), null, "an empty id must not match the first row");
});

test("readInventory survives storage that is missing or corrupt", () => {
  installStorage();
  assert.deepEqual(readInventory(), [], "nothing stored yet");

  globalThis.localStorage.setItem("data", "{ not json");
  assert.deepEqual(readInventory(), [], "unreadable storage is not a crash");

  /* A JSON object where an array belongs is the shape a hand-edited or
   * half-migrated export would have. */
  globalThis.localStorage.setItem("data", JSON.stringify({ rows: [] }));
  assert.deepEqual(readInventory(), []);
});

/* ── import validation ────────────────────────────────────────────────────── */

test("a real export round-trips", () => {
  const rows = [
    { key: "aug", itemKey: "steyr_aug.weapon", name: "AUG", price: 250, num: 5 },
    { key: "vest3", itemKey: "vest3.carry_item", name: "Ⅲ型防弹背心", price: 200, num: 2 },
  ];
  const out = parseInventoryImport(JSON.stringify(rows));
  assert.deepEqual(out.rows, rows);
});

test("a malformed file is reported, not thrown", () => {
  /* The old handler let `JSON.parse` throw inside a FileReader callback, where
   * nothing caught it and the user saw nothing at all. */
  const out = parseInventoryImport('{"key": "aug", ');
  assert.equal(out.reason, "importBadJson");
  assert.equal(out.rows, undefined);
});

test("a JSON payload that is not a list is rejected", () => {
  /* A single object used to be concatenated as one row, which then had no
   * usable identity. */
  assert.equal(parseInventoryImport('{"key":"aug"}').reason, "importNotArray");
  assert.equal(parseInventoryImport("null").reason, "importNotArray");
  assert.equal(parseInventoryImport('"a string"').reason, "importNotArray");
  assert.equal(parseInventoryImport("42").reason, "importNotArray");
});

test("a list with nothing usable in it is rejected", () => {
  assert.equal(parseInventoryImport("[]").reason, "importNoRows");
  assert.equal(parseInventoryImport("[1, null, \"x\"]").reason, "importNoRows");
  /* A row with no `key` cannot be rendered or identified. */
  assert.equal(parseInventoryImport('[{"name":"AUG"}]').reason, "importNoRows");
});

test("unusable rows are dropped and the rest are kept", () => {
  const out = parseInventoryImport(
    JSON.stringify([{ key: "aug", price: 1 }, null, { name: "no key" }, { key: "vest3" }]),
  );
  assert.deepEqual(out.rows.map((r) => r.key), ["aug", "vest3"]);
});
