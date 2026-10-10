/**
 * Inventory row identity.
 *
 * A row is `{ key, name, price, num, itemKey }`.
 *
 * `key` is the **hud icon** (`aav7_turret`). That is what every version of rwrsg
 * has written to localStorage and to exported JSON, and it is what the stall
 * renders, so it keeps that meaning forever.
 *
 * It is not unique, though. The catalog holds 948 records behind only 510 hud
 * icons; 69 icons are shared, covering 507 records. `aav7_gl.weapon` and
 * `aav7_mg.weapon` are both `aav7_turret`, and all 87 `grinch_*` records are
 * `vest_hole1`. Keying identity on the icon meant selecting one item lit up its
 * entire group and only one of the group could ever be in the stall.
 *
 * So rows also carry `itemKey`, the record key (`aav7_gl.weapon`), which *is*
 * unique. Rows saved before this — and rows imported from an old export — have
 * no `itemKey`, so they are resolved against the catalog on read. That is the
 * same treatment the 2026-01-31 key change needed, for the same reason: never
 * rewrite what the user saved beyond what is needed to make it render.
 */

/**
 * The hud icon behind a key that names a record, or null.
 *
 * Handles both shapes the key has taken: the icon itself (`aug`) and the record
 * key (`aug.weapon`, or `steyr_aug.weapon` after a rename).
 */
function iconForRecordKey(key, catalog) {
  if (catalog.iconUrl(key)) return key;

  const entry = catalog.entries[key];
  if (entry?.hud_icon) return entry.hud_icon;

  /* `<key>.<type>` where the record has since been renamed — `aug.weapon` is
   * now `steyr_aug.weapon`, so the lookup above misses, but the legacy key
   * still spells the hud icon in its first segment. */
  const dot = key.lastIndexOf(".");
  if (dot > 0) {
    const stem = key.slice(0, dot);
    if (catalog.iconUrl(stem)) return stem;
  }

  return null;
}

/**
 * Map any stored `key` onto a hud icon the catalog can render.
 * Falls back to the input when nothing matches, so callers can compare.
 */
function resolveInventoryKey(rawKey, catalog) {
  if (!rawKey) return rawKey;
  const key = String(rawKey);

  const direct = iconForRecordKey(key, catalog);
  if (direct) return direct;

  /* A bare `<key>` where the catalog only knows `<key>.<type>`. Only accept an
   * unambiguous match — guessing between several would silently repoint a row. */
  const prefix = `${key}.`;
  let match = null;
  for (const [candidate, candidateEntry] of Object.entries(catalog.entries)) {
    if (!candidate.startsWith(prefix)) continue;
    if (match !== null) return key; // ambiguous
    match = candidateEntry?.hud_icon || null;
  }
  if (match) return match;

  return key;
}

/**
 * Bring one row up to the current shape.
 *
 * `itemKey` is recovered in order of certainty:
 *   1. it is already stored and still resolves;
 *   2. the stored `key` is itself a record key (`aav7_gl.weapon`);
 *   3. the stored `key` resolves to a hud icon, and we take that icon's first
 *      record — a guess, but a deterministic one, and the only thing the old
 *      data recorded.
 * A row that resolves to nothing is returned untouched.
 */
function resolveInventoryRow(row, catalog) {
  if (!row || typeof row !== "object") return row;

  /* 1. Already precise. Re-derive `key` so the two can never drift apart. */
  const stored = row.itemKey;
  if (stored && catalog.entries[stored]) {
    const hud = catalog.entries[stored].hud_icon;
    /* An entry without a `hud_icon` cannot be rendered. Bailing here matters:
     * spreading it would write `key: undefined` over a row that currently
     * renders fine. */
    if (!hud) return row;
    if (hud === row.key && stored === row.itemKey) return row;
    return { ...row, key: hud, itemKey: stored };
  }

  const rawKey = row.key;
  if (rawKey == null) return row;

  /* 2. The stored key names the record exactly. */
  const direct = catalog.entries[String(rawKey)];
  if (direct?.hud_icon) {
    if (row.key === direct.hud_icon && row.itemKey === String(rawKey)) return row;
    return { ...row, key: direct.hud_icon, itemKey: String(rawKey) };
  }

  /* 3. Only the icon is recoverable; take the group's first record. */
  const hud = resolveInventoryKey(rawKey, catalog);
  const itemKey = catalog.keyFor(hud);
  if (!itemKey || (row.key === hud && row.itemKey === itemKey)) return row;
  return { ...row, key: hud, itemKey };
}

/**
 * Resolve every row. Returns the same array instance when nothing changed, so
 * callers can use it as a cheap "did anything move?" signal.
 */
export function resolveInventory(rows, catalog) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  let changed = false;
  const next = rows.map((row) => {
    const fixed = resolveInventoryRow(row, catalog);
    if (fixed !== row) changed = true;
    return fixed;
  });
  return changed ? next : rows;
}

/**
 * The identity a row is stored, de-duped and keyed on.
 *
 * `itemKey` is unique across the catalog; `key` is only the icon and is shared
 * by up to 87 records. Falling back to `key` keeps an unresolvable row usable
 * rather than dropping it.
 */
export function rowId(row) {
  if (!row || typeof row !== "object") return "";
  return row.itemKey || row.key || "";
}

/** De-dupe by identity, keeping the first occurrence. */
export function dedupeRows(rows) {
  if (!Array.isArray(rows)) return rows;
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = rowId(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/* ── storage ──────────────────────────────────────────────────────────────── */

export const INVENTORY_KEY = "data";

/* The home page and the workbench are separate component trees with no shared
 * state. The workbench writes straight to storage, so it announces the write
 * and the home page re-reads — three lines instead of lifting state up. */
export const INVENTORY_EVENT = "rwrsg:inventory";

export function readInventory() {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeInventory(rows) {
  const next = dedupeRows(rows);
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode — nothing useful to do, the caller's UI still updates */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(INVENTORY_EVENT));
  }
  return next;
}

/** The stall row with this identity, or null. */
export function inventoryRowFor(id) {
  if (!id) return null;
  return readInventory().find((row) => rowId(row) === id) || null;
}

/**
 * Parse an exported file into rows.
 *
 * Returns `{ rows }` on success or `{ reason }` on failure, where `reason` is an
 * i18n key — the message is user-facing, so it must not be baked in here.
 *
 * The old handler ran `JSON.parse` straight inside a FileReader callback with no
 * catch: a truncated or wrong file threw where nothing could see it, and a
 * non-array payload was concatenated as one bogus row. Both failed silently.
 */
export function parseInventoryImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { reason: "importBadJson" };
  }
  if (!Array.isArray(parsed)) return { reason: "importNotArray" };

  /* An export is `[{key, name, price, num}]`. A row without a `key` cannot be
   * rendered or identified, so it is dropped rather than carried. */
  const rows = parsed.filter((row) => row && typeof row === "object" && row.key);
  if (!rows.length) return { reason: "importNoRows" };
  return { rows };
}

/** Append rows, de-duped by identity. Returns the stored list. */
export function addInventoryRows(rows) {
  return writeInventory(readInventory().concat(rows));
}

/**
 * Add or replace rows, by identity, keeping each row's position.
 *
 * The workbench's button is labelled 添加/编辑 — add *or edit* — and it opens a
 * price/quantity dialog for an item that may already be in the stall. Plain
 * `addInventoryRows` cannot express that: `dedupeRows` keeps the **first**
 * occurrence, so for an item already present the edited price and quantity were
 * silently discarded and the button appeared to do nothing.
 *
 * A new row is appended; an existing one is replaced in place, so editing does
 * not also reorder the stall.
 */
export function upsertInventoryRows(rows) {
  const existing = readInventory();
  const indexOf = new Map(existing.map((row, i) => [rowId(row), i]));
  const next = [...existing];

  for (const row of rows) {
    const id = rowId(row);
    const at = indexOf.get(id);
    if (at === undefined) {
      indexOf.set(id, next.length);
      next.push(row);
    } else {
      next[at] = row;
    }
  }

  return writeInventory(next);
}
