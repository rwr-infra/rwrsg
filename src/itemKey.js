/**
 * The `<key>.<type>` record key, and the hud icon derived from a file path.
 *
 * Both are small, and both were written out by hand in three places — the wiki
 * link builder, the picker's type filter and the grouping module each parsed
 * the type out of a key independently, and `hudIconFromPath` is the bridge that
 * makes an online record renderable at all. Small enough to look harmless, and
 * exactly the kind of thing that drifts until one caller disagrees with another.
 *
 * No React, no DOM, no imports — so it is directly testable.
 */

/** The three record types rwrsg treats as sellable. */
export const SELLABLE_TYPES = ["weapon", "carry_item", "projectile"];

const SELLABLE = new Set(SELLABLE_TYPES);

/**
 * The type segment of a record key: `aav7_gl.weapon` → `weapon`.
 *
 * The split is on the **last** dot, because a key's own name may contain one
 * (`ar15_w_m203.weapon` has none, but online keys are not guaranteed to be
 * dot-free). Returns null when there is no type segment.
 */
export function typeOfKey(key) {
  const text = String(key ?? "");
  const dot = text.lastIndexOf(".");
  return dot > 0 ? text.slice(dot + 1) : null;
}

/** Is this a type rwrsg can put in a stall? */
export function isSellableType(type) {
  return SELLABLE.has(type);
}

/**
 * Does this record key *name* this icon? `vest3` names `vest3.carry_item`.
 *
 * The pairing the old UI wrote when it stored a bare hud icon, so it is the
 * only defensible way to recover a legacy row's identity. It matters because an
 * icon is not unique: the `vest3` icon is used by 35 records — the bunny,
 * evil-commander, infected-ripper and pumpkin-knight outfits all reuse the vest
 * sprite — so "the first record with this icon" picks an unrelated item.
 */
export function keyNamesIcon(key, hudIcon) {
  if (!key || !hudIcon) return false;
  if (!typeOfKey(key)) return false;
  return String(key).slice(0, String(key).lastIndexOf(".")) === hudIcon;
}

/**
 * `textures/hud_ac556.png` → `ac556`.
 *
 * The inverse of how rwrsg names its bundled PNGs, and the only reason an
 * online record can be matched to one. Handles both path separators and any
 * extension; the `hud_` prefix is stripped case-insensitively because the game
 * ships a few `HUD_`-cased paths.
 *
 * Returns null when there is no usable name — including the degenerate
 * `hud_.png`, which would otherwise yield an empty string that is falsy but is
 * not `null`, so a caller checking `=== null` would miss it.
 */
export function hudIconFromPath(path) {
  if (!path) return null;
  const base = String(path)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.\w+$/, "");
  if (!base) return null;
  const name = base.slice(0, 4).toLowerCase() === "hud_" ? base.slice(4) : base;
  return name || null;
}
