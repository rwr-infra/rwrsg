/**
 * Checks for the grouping rules — see docs/ITEM-GROUPING.md.
 *
 * Run with `npm test` (node:test, no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildGroups } from "./itemGroups.js";

const rec = (type, chain) => ({ type, chain });

test("weapon configurations are one group", () => {
  const { groups, groupOf } = buildGroups({
    "ac556.weapon": rec("weapon", { next: ["ac556_b.weapon"], transform: null }),
    "ac556_b.weapon": rec("weapon", { next: ["ac556.weapon"], transform: null }),
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 2);
  assert.equal(groups[0].kind, "weapon");
  assert.equal(groupOf.get("ac556_b.weapon"), groups[0]);
});

test("a mutual pair has no pristine member, so the smallest key leads", () => {
  const { groups } = buildGroups({
    "b.weapon": rec("weapon", { next: ["a.weapon"], transform: null }),
    "a.weapon": rec("weapon", { next: ["b.weapon"], transform: null }),
  });
  assert.equal(groups[0].representative, "a.weapon");
});

test("a degradation chain leads with the form that nothing turns into", () => {
  const { groups } = buildGroups({
    "snowman.carry_item": rec("carry_item", { next: [], transform: "snowman_2" }),
    snowman_2: rec("carry_item", { next: [], transform: "snowman_3" }),
    snowman_3: rec("carry_item", { next: [], transform: null }),
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 3);
  assert.equal(groups[0].representative, "snowman.carry_item");
  assert.deepEqual(groups[0].members, ["snowman.carry_item", "snowman_2", "snowman_3"]);
});

test("a self-link is ignored rather than creating a group", () => {
  const { groups } = buildGroups({
    "vest_exo_ai_4": rec("carry_item", { next: [], transform: "vest_exo_ai_4" }),
  });
  assert.equal(groups.length, 0);
});

test("links outside the view do not invent members", () => {
  /* A package slice can hold only part of a chain; the group shrinks with it. */
  const { groups } = buildGroups({
    snowman_2: rec("carry_item", { next: [], transform: "snowman_3" }),
  });
  assert.equal(groups.length, 0, "one member is not a group");
});

test("a partial chain still groups what is present", () => {
  const { groups } = buildGroups({
    snowman_2: rec("carry_item", { next: [], transform: "snowman_3" }),
    snowman_3: rec("carry_item", { next: [], transform: "snowman_4" }),
  });
  assert.equal(groups.length, 1);
  /* snowman_2 has no incoming edge inside the view, so it leads here even
   * though the full chain starts at snowman.carry_item. */
  assert.equal(groups[0].representative, "snowman_2");
});

test("ungrouped records produce no groups", () => {
  const { groups, groupOf } = buildGroups({
    "lottery.carry_item": rec("carry_item", { next: [], transform: null }),
    "aug.weapon": rec("weapon", { next: [], transform: null }),
  });
  assert.equal(groups.length, 0);
  assert.equal(groupOf.size, 0);
});

test("a chain of 46 folds into one group", () => {
  const records = {};
  const keys = Array.from({ length: 46 }, (_, i) =>
    i === 0 ? "snowman.carry_item" : `snowman_${i + 1}`,
  );
  keys.forEach((key, i) => {
    records[key] = rec("carry_item", {
      next: [],
      transform: i + 1 < keys.length ? keys[i + 1] : null,
    });
  });
  const { groups } = buildGroups(records);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 46);
  assert.equal(groups[0].representative, "snowman.carry_item");
});
