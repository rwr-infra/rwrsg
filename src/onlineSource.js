/**
 * Online data source — the rwrops data site (rwr-static.079682.xyz).
 *
 * rwrsg ships a hand-pulled snapshot of the game (`src/data.json` plus the item
 * PNGs under `src/assets/items/`). That snapshot is the source of truth for an
 * item's identity, Chinese name and price, and this module is not allowed to
 * change any of it. What it adds:
 *
 *   - an icon index, so an item whose PNG is not bundled still renders;
 *   - the records rwrsg has never seen, so new game content shows up on its own.
 *
 * `catalog.js` is what merges the two, and it always lets the bundled data win.
 * If the fetch fails — offline, blocked, API down — the app behaves exactly as
 * it did before this module existed.
 *
 * Identity note: rwrsg keys an inventory row on the *hud icon basename*
 * (`ac556`, not `ac556.weapon`), because that is what it writes to
 * localStorage and to exported JSON. `hudIconFromPath` reproduces that
 * derivation from the online `hud_icon_filename`, so rows keep round-tripping.
 */
import { useEffect, useSyncExternalStore } from "react";
import { hudIconFromPath, isSellableType, typeOfKey } from "./itemKey.js";

const ORIGIN = "https://rwr-static.079682.xyz";

/* The bundled snapshot (`src/data.json`) was pulled from **vanilla**, so the
 * online layer has to be vanilla too. The two must agree or the chain relations
 * break: in `classic`, `vest2.carry_item` is repurposed as a health item
 * ("Health, 150%") and `vest2_2`/`vest2_3` do not exist at all, so the
 * Ⅱ型防弹背心 degradation chain has nothing to link and never groups.
 *
 * classic is not a strict superset anyway — it covers 2 fewer of the app's keys
 * than vanilla does, and its 15 extra hud icons are for items rwrsg has no
 * bundled name for. */
const PREFERRED_PACKAGE = "vanilla";

const ENABLED_KEY = "rwrsg.online.enabled";
const PACKAGE_KEY = "rwrsg.online.package";

/* Bump CACHE_SHAPE whenever the *shape* of a cached payload changes — a new
 * field on the trimmed records, a renamed one, anything a reader depends on.
 *
 * Without it a stale payload stays valid for CACHE_TTL, so a field added today
 * silently does nothing for up to six hours. That is exactly how the chain data
 * behind item grouping went missing: the records were cached without it, and
 * the cache was still considered fresh. */
const CACHE_SHAPE = 2;
const CACHE_KEY = "rwrsg.online.cache";
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h — long enough to be free, short enough to stay current

/* Fields the online records carry that rwrsg either already knows, has no use
 * for, or must not copy. `inventory_price` is deliberately here: it is the
 * game's internal value (ac556 = 490) and is on a completely different scale
 * from the community group prices in `price.json` (ac556 = 6000). Copying it
 * would silently reprice everyone's stall. */
const SKIP_FIELDS = new Set([
  "key",
  "type",
  "name",
  "_source",
  "_id",
  "hud_icon_filename",
  "model_filename",
  "model_mesh",
  "inventory_price",
  "inherit_from",
]);

/* ── path helpers ─────────────────────────────────────────────────────────── */

/** Deep link to the item's page on the wiki. `ac556.weapon` → `/params/weapon/ac556.weapon` */
export function wikiUrl(key, packageId) {
  const type = typeOfKey(key);
  if (!type) return null;
  const q = packageId ? `?pkg=${encodeURIComponent(packageId)}` : "";
  return `https://rwrops.b.rwr-infra.uk/params/${encodeURIComponent(type)}/${encodeURIComponent(key)}${q}`;
}

/* ── store ────────────────────────────────────────────────────────────────── */

function readFlag(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function readPackage() {
  try {
    return localStorage.getItem(PACKAGE_KEY) || PREFERRED_PACKAGE;
  } catch {
    return PREFERRED_PACKAGE;
  }
}

let snapshot = {
  status: readFlag(ENABLED_KEY, true) ? "idle" : "disabled", // idle|loading|ready|error|disabled
  enabled: readFlag(ENABLED_KEY, true),
  error: null,
  packageId: null,
  packages: [],
  iconIndex: {}, // hud icon basename → absolute asset URL
  records: {}, // "<key>.<type>" → trimmed online record
  lastSync: 0,
  fromCache: false,
};

const listeners = new Set();

function emit(patch) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      /* One bad subscriber must not abort the store — or the caller, which may
       * still have work to do after emitting (persisting, for instance). */
      if (import.meta.env.DEV) console.warn("[rwrsg] store subscriber threw", e);
    }
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

/* ── cache ────────────────────────────────────────────────────────────────── */

/**
 * The cached payload, but only if it came from the package we now want.
 *
 * Without the package check a payload cached under one package keeps being
 * served after the default changes — which is how a stale `classic` cache hid
 * the Ⅱ型防弹背心 chain data that only `vanilla` has.
 */
function readCache(expectedPackageId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.shape !== CACHE_SHAPE) return null;
    if (expectedPackageId && parsed.packageId !== expectedPackageId) return null;
    if (Date.now() - (parsed.lastSync || 0) > CACHE_TTL) return null;
    if (!parsed.iconIndex || !parsed.records) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(next) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        shape: CACHE_SHAPE,
        lastSync: next.lastSync,
        packageId: next.packageId,
        packages: next.packages,
        iconIndex: next.iconIndex,
        records: next.records,
      }),
    );
  } catch (e) {
    /* Quota or private mode. The cache is an optimisation, never a requirement
     * — but failing silently once cost an afternoon, so say why in dev. */
    if (import.meta.env.DEV) {
      console.warn("[rwrsg] could not cache the online source", e);
    }
  }
}

/* ── fetch ────────────────────────────────────────────────────────────────── */

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function trimRecord(record) {
  const hud = hudIconFromPath(record.hud_icon_filename);
  if (!hud) return null; // no icon → cannot be added to the picker

  const spec = {};
  for (const [field, value] of Object.entries(record)) {
    if (SKIP_FIELDS.has(field)) continue;
    if (value === null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      spec[field] = value;
    }
  }
  /* The bundled data keeps stances as a flat map (`stance.running`); the online
   * schema stores an array. Normalise so the detail table renders identically. */
  if (Array.isArray(record.stances)) {
    const stance = {};
    for (const s of record.stances) {
      if (s?.state_key) stance[s.state_key] = s.accuracy;
    }
    if (Object.keys(stance).length) spec.stance = stance;
  }

  return {
    key: record.key,
    type: record.type,
    en_name: record.name || record.key,
    hud_icon: hud,
    spec,
    /* The two relations that define "these are the same thing" — see
     * itemGroups.js. Reduced to bare keys so the cache stays small. */
    chain: {
      next: Array.isArray(record.next_in_chains)
        ? record.next_in_chains
            .map((c) => (typeof c === "string" ? c : c?.key))
            .filter(Boolean)
        : [],
      transform:
        typeof record.transform_on_consume === "string"
          ? record.transform_on_consume
          : null,
    },
  };
}

let inflight = null;
let started = false;

async function load({ force = false } = {}) {
  if (!snapshot.enabled) {
    emit({ status: "disabled" });
    return;
  }
  if (inflight) return inflight;

  const wanted = readPackage();

  if (!force) {
    const cached = readCache(wanted);
    if (cached) {
      emit({
        status: "ready",
        fromCache: true,
        error: null,
        packageId: cached.packageId,
        packages: cached.packages || [],
        iconIndex: cached.iconIndex,
        records: cached.records,
        lastSync: cached.lastSync,
      });
      return; // fresh enough; refresh happens on the next TTL expiry
    }
  }

  emit({ status: snapshot.status === "ready" ? "ready" : "loading", error: null });

  inflight = (async () => {
    try {
      const manifest = await fetchJson(`${ORIGIN}/packages.json`);
      const ids = (manifest?.packages || []).map((p) => p.id).filter(Boolean);
      if (!ids.length) throw new Error("packages.json listed no packages");

      const packageId = ids.includes(wanted)
        ? wanted
        : ids.includes(PREFERRED_PACKAGE)
          ? PREFERRED_PACKAGE
          : ids[0];

      const [index, result] = await Promise.all([
        fetchJson(`${ORIGIN}/packages/${packageId}/assets.json`),
        fetchJson(`${ORIGIN}/packages/${packageId}/result.json`),
      ]);

      const iconIndex = {};
      for (const [origPath, flatName] of Object.entries(index || {})) {
        const hud = hudIconFromPath(origPath);
        if (hud && !iconIndex[hud]) iconIndex[hud] = `${ORIGIN}/assets/${flatName}`;
      }

      const records = {};
      for (const record of result?.records || []) {
        if (!record?.key || !isSellableType(record.type)) continue;
        const trimmed = trimRecord(record);
        if (trimmed) records[trimmed.key] = trimmed;
      }

      const next = {
        status: "ready",
        error: null,
        packageId,
        packages: ids,
        iconIndex,
        records,
        lastSync: Date.now(),
        fromCache: false,
      };
      /* Persist before announcing. A subscriber that throws used to abort the
       * rest of this block, which silently skipped the cache write. */
      writeCache(next);
      emit(next);
    } catch (e) {
      /* Keep whatever we already have; only surface the error if there is
       * nothing to fall back on. The bundled data still covers the app. */
      emit({
        status: snapshot.status === "ready" ? "ready" : "error",
        error: String(e?.message || e),
      });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/* ── per-package item index ───────────────────────────────────────────────── */

/* Browsing "only what my server actually runs" needs each package's item list.
 * `packages.json` only carries counts, so the list has to come from that
 * package's `result.json` — 2–4 MB each. Fetched on demand and reduced to the
 * fields the picker needs, then cached, which brings it down to tens of KB. */
/* Same reason as CACHE_SHAPE above: the per-package items carry `chain` too. */
const PKG_CACHE_SHAPE = 2;
const PKG_CACHE_KEY = "rwrsg.online.pkgindex";
const PKG_CACHE_TTL = 24 * 60 * 60 * 1000;
const PKG_CACHE_MAX = 4;

function readPkgCache() {
  try {
    const raw = localStorage.getItem(PKG_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

/** One package's cached items, or null when absent, stale or of an old shape. */
function readPkgEntry(packageId) {
  const entry = readPkgCache()[packageId];
  if (!entry || entry.shape !== PKG_CACHE_SHAPE) return null;
  if (Date.now() - (entry.ts || 0) > PKG_CACHE_TTL) return null;
  return entry.items || null;
}

function writePkgCache(packageId, items) {
  try {
    const all = readPkgCache();
    all[packageId] = { shape: PKG_CACHE_SHAPE, ts: Date.now(), items };
    /* Keep the cache bounded — several packages at once would otherwise creep
     * toward the localStorage quota. */
    const entries = Object.entries(all).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    const pruned = Object.fromEntries(entries.slice(0, PKG_CACHE_MAX));
    localStorage.setItem(PKG_CACHE_KEY, JSON.stringify(pruned));
  } catch {
    /* quota or private mode — the index is an optimisation, not a requirement */
  }
}

let pkgSnapshot = { status: "idle", packageId: null, items: {}, error: null };
const pkgListeners = new Set();

function emitPkg(patch) {
  pkgSnapshot = { ...pkgSnapshot, ...patch };
  for (const l of pkgListeners) l();
}

function subscribePkg(listener) {
  pkgListeners.add(listener);
  return () => pkgListeners.delete(listener);
}

function getPkgSnapshot() {
  return pkgSnapshot;
}

const pkgInflight = new Map();

async function loadPackageIndex(packageId, { force = false } = {}) {
  if (!packageId) return null;
  if (!force && pkgSnapshot.packageId === packageId && pkgSnapshot.status === "ready") {
    return pkgSnapshot.items;
  }
  if (pkgInflight.has(packageId)) return pkgInflight.get(packageId);

  const cached = readPkgEntry(packageId);
  if (!force && cached) {
    emitPkg({ status: "ready", packageId, items: cached, error: null });
    return cached;
  }

  emitPkg({ status: "loading", packageId, items: {}, error: null });

  const job = (async () => {
    try {
      const result = await fetchJson(`${ORIGIN}/packages/${packageId}/result.json`);
      const items = {};
      for (const record of result?.records || []) {
        if (!record?.key || !isSellableType(record.type)) continue;
        const hud = hudIconFromPath(record.hud_icon_filename);
        if (!hud) continue;
        items[record.key] = {
          en_name: record.name || record.key,
          hud_icon: hud,
          chain: {
            next: Array.isArray(record.next_in_chains)
              ? record.next_in_chains
                  .map((c) => (typeof c === "string" ? c : c?.key))
                  .filter(Boolean)
              : [],
            transform:
              typeof record.transform_on_consume === "string"
                ? record.transform_on_consume
                : null,
          },
        };
      }
      emitPkg({ status: "ready", packageId, items, error: null });
      writePkgCache(packageId, items);
      return items;
    } catch (e) {
      emitPkg({ status: "error", packageId, items: {}, error: String(e?.message || e) });
      return null;
    } finally {
      pkgInflight.delete(packageId);
    }
  })();

  pkgInflight.set(packageId, job);
  return job;
}

/**
 * The item list for one package.
 *
 * The package the app already synced is returned straight from that payload —
 * no second fetch for the common case.
 */
export function usePackageIndex(packageId) {
  const snap = useSyncExternalStore(subscribePkg, getPkgSnapshot, getPkgSnapshot);
  const online = useOnlineSource();

  const activeHasRecords =
    packageId && packageId === online.packageId && Object.keys(online.records).length > 0;

  useEffect(() => {
    if (!packageId || activeHasRecords) return;
    loadPackageIndex(packageId);
  }, [packageId, activeHasRecords]);

  if (!packageId) return { status: "idle", items: {} };
  if (activeHasRecords) return { status: "ready", items: online.records };
  if (snap.packageId !== packageId) return { status: "loading", items: {} };
  return snap;
}

/* ── the union of every package ───────────────────────────────────────────── */

/* `packages.json` carries no item list, and `metadata.yaml` is 297 bytes of
 * counts, so the only per-package item source is that package's `result.json` —
 * about 4 MB each, roughly 88 MB across all 22. Far too much to load by
 * default, so this is explicit, bounded, cached, and reports progress.
 *
 * It is worth having because a single package can hold items the app's own
 * catalog does not: `man_vs_zombies` has 1258 items against the catalog's 948
 * records, so without a union the "all packages" view is not actually a
 * superset of the packages it claims to cover. */
const UNION_CACHE_KEY = "rwrsg.online.union";
const UNION_CACHE_SHAPE = 1;
const UNION_TTL = 24 * 60 * 60 * 1000;
/* Six at a time: enough to keep the pipe busy without opening 22 sockets or
 * making one slow package block the rest. */
const UNION_CONCURRENCY = 6;

let unionSnapshot = {
  status: "idle", // idle | loading | ready | error
  done: 0,
  total: 0,
  failed: [],
  items: {},
  lastSync: 0,
};

const unionListeners = new Set();

function emitUnion(patch) {
  unionSnapshot = { ...unionSnapshot, ...patch };
  for (const l of unionListeners) {
    try {
      l();
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[rwrsg] union subscriber threw", e);
    }
  }
}

function subscribeUnion(listener) {
  unionListeners.add(listener);
  return () => unionListeners.delete(listener);
}

function getUnionSnapshot() {
  return unionSnapshot;
}

function readUnionCache() {
  try {
    const raw = localStorage.getItem(UNION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.shape !== UNION_CACHE_SHAPE) return null;
    if (Date.now() - (parsed.lastSync || 0) > UNION_TTL) return null;
    if (!parsed.items) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeUnionCache(items, lastSync) {
  try {
    localStorage.setItem(
      UNION_CACHE_KEY,
      JSON.stringify({ shape: UNION_CACHE_SHAPE, lastSync, items }),
    );
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[rwrsg] could not cache the union", e);
  }
}

/** Reduce a package's result.json to just what the picker needs. */
function indexPackageItems(result) {
  const items = {};
  for (const record of result?.records || []) {
    if (!record?.key || !isSellableType(record.type)) continue;
    const hud = hudIconFromPath(record.hud_icon_filename);
    if (!hud) continue;
    items[record.key] = {
      en_name: record.name || record.key,
      hud_icon: hud,
      chain: {
        next: Array.isArray(record.next_in_chains)
          ? record.next_in_chains
              .map((c) => (typeof c === "string" ? c : c?.key))
              .filter(Boolean)
          : [],
        transform:
          typeof record.transform_on_consume === "string"
            ? record.transform_on_consume
            : null,
      },
    };
  }
  return items;
}

let unionInflight = null;

/** Fetch every package and merge them into one item map. Cached for a day. */
export function loadAllPackages({ force = false } = {}) {
  if (unionInflight) return unionInflight;

  if (!force) {
    const cached = readUnionCache();
    if (cached) {
      emitUnion({
        status: "ready",
        items: cached.items,
        lastSync: cached.lastSync,
        done: Object.keys(cached.items).length,
        total: Object.keys(cached.items).length,
        failed: [],
      });
      return Promise.resolve(cached.items);
    }
  }

  unionInflight = (async () => {
    try {
      const manifest = await fetchJson(`${ORIGIN}/packages.json`);
      const ids = (manifest?.packages || []).map((p) => p.id).filter(Boolean);
      if (!ids.length) throw new Error("packages.json listed no packages");

      emitUnion({ status: "loading", done: 0, total: ids.length, failed: [], items: {} });

      const merged = {};
      const failed = [];
      let done = 0;
      let cursor = 0;

      /* A tiny worker pool. Each worker takes the next package off the queue and
       * merges what it got, so items appear progressively instead of after a
       * long silence. */
      const worker = async () => {
        while (cursor < ids.length) {
          const id = ids[cursor++];
          try {
            const result = await fetchJson(`${ORIGIN}/packages/${id}/result.json`);
            const items = indexPackageItems(result);
            for (const [key, value] of Object.entries(items)) {
              /* First package wins, so the base layers are not overwritten by a
               * mod that happens to redefine the same key. */
              if (!merged[key]) merged[key] = value;
            }
            /* Feed the per-package cache too — browsing a package later is then
             * instant. */
            writePkgCache(id, items);
          } catch {
            failed.push(id);
          }
          done += 1;
          emitUnion({ done, failed: [...failed] });
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(UNION_CONCURRENCY, ids.length) }, worker),
      );

      const lastSync = Date.now();
      emitUnion({ status: "ready", items: merged, lastSync, failed: [...failed] });
      writeUnionCache(merged, lastSync);
      return merged;
    } catch (e) {
      emitUnion({
        status: unionSnapshot.status === "ready" ? "ready" : "error",
        error: String(e?.message || e),
      });
      return null;
    } finally {
      unionInflight = null;
    }
  })();

  return unionInflight;
}

export function usePackageUnion() {
  const snap = useSyncExternalStore(subscribeUnion, getUnionSnapshot, getUnionSnapshot);

  useEffect(() => {
    const cached = readUnionCache();
    if (cached && unionSnapshot.status === "idle") {
      emitUnion({ status: "ready", items: cached.items, lastSync: cached.lastSync });
    }
  }, []);

  return snap;
}

/* ── public controls ──────────────────────────────────────────────────────── */

export function setOnlineEnabled(on) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  emit({ enabled: !!on, status: on ? "idle" : "disabled", error: null });
  if (on) load();
}

/* ── hook ─────────────────────────────────────────────────────────────────── */

export function useOnlineSource() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /* Module-level guard: two components mounting this hook must still trigger a
   * single fetch. Later re-enables go through setOnlineEnabled, which loads. */
  useEffect(() => {
    if (!started && snapshot.enabled) {
      started = true;
      load();
    }
  }, []);

  return snap;
}
