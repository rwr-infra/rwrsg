/**
 * The item catalog rwrsg renders from.
 *
 * Two layers, and the order matters:
 *
 *   1. The bundled snapshot (`data.json` + the PNGs) — authoritative for
 *      identity, Chinese names, spec and price. Untouched.
 *   2. The online layer — supplies an icon when no PNG is bundled, and the
 *      records the snapshot has never seen.
 *
 * A bundled entry is never overwritten, and an online record only joins the
 * catalog if its icon actually resolves, so every row in the picker renders.
 * With the online layer off (or unreachable) this returns exactly what rwrsg
 * shipped.
 */
import { useMemo } from "react";
import bundled from "./data.json";
import { useOnlineSource } from "./onlineSource.js";
import { keyNamesIcon } from "./itemKey.js";

const imageModules = import.meta.glob("./assets/items/*.png", { eager: true });

/** Keyed by the same `./assets/items/<hud_icon>.png` path the app has always used. */
const localIconUrls = Object.fromEntries(
  Object.entries(imageModules).map(([path, mod]) => [path, mod.default]),
);

function localIconUrl(hudIcon) {
  if (!hudIcon) return null;
  return localIconUrls[`./assets/items/${hudIcon}.png`] || null;
}

export function useCatalog() {
  const online = useOnlineSource();

  return useMemo(() => {
    /* Switching the source off must actually switch it off — the snapshot keeps
     * its records and icon index so re-enabling is instant, so the gate belongs
     * here rather than in the store. */
    const active = online.enabled;

    const entries = { ...bundled };
    let added = 0;
    const addedKeys = [];

    if (active) {
      for (const [key, record] of Object.entries(online.records)) {
        if (entries[key]) continue; // bundled data always wins
        const icon = localIconUrl(record.hud_icon) || online.iconIndex[record.hud_icon];
        if (!icon) continue; // nothing to render → do not offer it
        entries[key] = {
          en_name: record.en_name,
          cn_name: null, // no bundled translation; the UI falls back to the English name
          spec: record.spec,
          key,
          hud_icon: record.hud_icon,
          type: record.type,
          online: true,
        };
        added += 1;
        addedKeys.push(key);
      }
    }

    const iconUrl = (hudIcon) =>
      localIconUrl(hudIcon) || (active ? online.iconIndex[hudIcon] : null) || null;

    /* Several records can share one hud icon — 69 icons cover 507 of the 948
     * records. The `vest3` icon alone is used by 35, because the bunny,
     * evil-commander, infected-ripper and pumpkin-knight outfits all reuse the
     * vest sprite. So "the first record with this icon" is arbitrary. */
    const byHudIcon = {};
    for (const [key, entry] of Object.entries(entries)) {
      const hud = entry?.hud_icon;
      if (hud && !byHudIcon[hud]) byHudIcon[hud] = { key, entry };
    }

    /* The record an icon *names*: `vest3` → `vest3.carry_item`.
     *
     * That is the pairing the old UI wrote when it stored a bare icon, so it is
     * the only defensible way to recover a legacy row's identity. It matters:
     * 38 of the 69 shared icons have such a record, and for 15 of them it is not
     * the first one — so without this, a row for `vest3` resolved to
     * `bunny_cub_event.carry_item`, and its wiki link pointed at a bunny suit. */
    const byIconStem = {};
    for (const [key, entry] of Object.entries(entries)) {
      const hud = entry?.hud_icon;
      if (!hud || byIconStem[hud]) continue;
      if (keyNamesIcon(key, hud)) byIconStem[hud] = key;
    }

    return {
      /** Same shape as `data.json`, so call sites read it the same way. */
      entries,
      /** How many entries the online layer contributed. */
      added,
      /** Resolve a hud icon basename to a usable URL. Bundled PNG first. */
      iconUrl,
      /** The record key behind a hud icon — an icon can stand for several. */
      keyFor: (hudIcon) => byIconStem[hudIcon] || byHudIcon[hudIcon]?.key || null,
      online,
    };
  }, [online]);
}
