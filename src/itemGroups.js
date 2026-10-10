/**
 * Item grouping — "these records are the same thing".
 *
 * rwrsg's catalog is a flat list of game records, but the game does not treat
 * them as separate items. Two relations in the extracted data say so:
 *
 *   1. **Weapon configurations** — `weapon.next_in_chains` links the
 *      configurations of one weapon to each other. `ac556.weapon` and
 *      `ac556_b.weapon` are the same rifle with and without its bayonet; the
 *      link is mutual. In the classic package 131 weapons sit in 65 such
 *      groups, 82 of them pairs.
 *
 *   2. **Degradation chains** — `carry_item.transform_on_consume` names what an
 *      item becomes once it is consumed. `snowman.carry_item` → `snowman_2` →
 *      `snowman_3` → … → `snowman_45` is one snowman wearing down, not 45
 *      items. In the classic package 472 items form chains up to 46 long.
 *
 * Shown flat, a single weapon appears several times and one degrading item
 * appears dozens of times, which is what made the picker hard to read. Grouped,
 * each thing appears once.
 *
 * The **representative** of a group is the member with no incoming edge — the
 * pristine form (`snowman.carry_item`, not `snowman_17`). Where a group has no
 * such member (mutual configuration links have none) the lexicographically
 * smallest key is used, so the choice is stable across runs and packages.
 *
 * These rules are the same ones the wiki uses; see docs/ITEM-GROUPING.md.
 */

import { typeOfKey } from "./itemKey.js";

/** The keys a record links to, from either relation. */
function linksOf(record) {
  const out = [];
  if (record && Array.isArray(record.chain?.next)) {
    for (const key of record.chain.next) if (key) out.push(key);
  }
  if (record && typeof record.chain?.transform === "string") {
    out.push(record.chain.transform);
  }
  return out;
}

/**
 * Group the given records.
 *
 * @param {Record<string, {type?: string, chain?: {next?: string[], transform?: string|null}}>} records
 *   keyed by record key. Only keys present here take part, so the same function
 *   serves the whole catalog and a single package's slice of it.
 * @returns {{groups: Array, groupOf: Map<string, object>}}
 */
export function buildGroups(records) {
  const keys = Object.keys(records || {});
  const parent = new Map(keys.map((k) => [k, k]));

  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    /* Path compression — chains here reach 46 deep. */
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  /* A member with an incoming edge is a later form, never the representative. */
  const hasIncoming = new Set();

  for (const key of keys) {
    for (const target of linksOf(records[key])) {
      /* A link out of the current view is ignored rather than inventing a
       * member: the same group can look smaller inside a package slice. */
      if (!parent.has(target) || target === key) continue;
      union(key, target);
      hasIncoming.add(target);
    }
  }

  const buckets = new Map();
  for (const key of keys) {
    const root = find(key);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(key);
  }

  const groupOf = new Map();
  const groups = [];

  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort();
    const representative =
      sorted.find((k) => !hasIncoming.has(k)) || sorted[0];
    const group = {
      id: representative,
      representative,
      members: sorted,
      kind: records[representative]?.type || typeOfKey(representative) || "other",
      size: sorted.length,
    };
    for (const key of sorted) groupOf.set(key, group);
    groups.push(group);
  }

  return { groups, groupOf };
}
