/**
 * Number formatting for the exported stall picture.
 *
 * Lived inline in `App.jsx`, where nothing could reach it. Prices run to the
 * millions in a big stall, so a raw `1234567 rp` overflows its cell; this
 * shortens it to `1.234m rp`.
 */

/**
 * Shorten a price with a magnitude suffix: `1234` → `1.234k`.
 *
 * Accepts a number or a numeric string, because the call site hands it the
 * result of `toFixed(0)`. Anything below 1000 is returned unchanged (no
 * suffix), and a value that is not finite is returned as `"0"` rather than
 * `"NaN"` — the picture must never render `NaN rp`.
 */
export function unitTrans(num) {
  const n = typeof num === "number" ? num : Number(num);
  if (!Number.isFinite(n)) return "0";

  const abs = Math.abs(n);
  const scale =
    abs >= 1e12 ? [1e12, "t"] : abs >= 1e9 ? [1e9, "b"] : abs >= 1e6 ? [1e6, "m"] : abs >= 1e3 ? [1e3, "k"] : null;

  /* Below 1000 there is no suffix, and the raw value is what the game shows. */
  if (!scale) return String(n);

  /* Dividing down first keeps the result below 1000, so `toString()` can never
   * reach scientific notation — the old `toLocaleString("fullwide", …)` guard
   * was unreachable, and `"fullwide"` is a numbering system, not a locale. */
  return n / scale[0] + scale[1];
}
