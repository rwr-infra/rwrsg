/**
 * Visual item picker.
 *
 * Replaces the old multi-select: a 900-option dropdown where every row was the
 * same grey string (`中文名-英文名 (key)`) and nothing showed what the item
 * looked like. Searching was the only way to find anything.
 *
 * This is a browsable grid instead — icon, both names, the key — with search,
 * a type filter, a package filter and a "hide what I already have" toggle.
 *
 * Two rules govern what a tile *is*:
 *
 *   - **Identity is the record key** (`aav7_gl.weapon`), never the hud icon.
 *     The catalog holds 948 records behind only 510 icons, so keying on the
 *     icon made selecting `aav7_gl` light up `aav7_mg` as well — both are
 *     `aav7_turret` — and only one of any such group could ever be added.
 *   - **One tile per group.** Weapon configurations and degradation chains are
 *     one item, not many; see itemGroups.js for the relations and the rules.
 *     A grouped tile drills down to its members.
 *
 * The component only owns selection; the caller decides what to do with the
 * chosen keys (it is the caller that knows about prices and de-duping).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { CheckOutlined, LeftOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { loadAllPackages, usePackageIndex, usePackageUnion } from "./onlineSource.js";
import { buildGroups } from "./itemGroups.js";
import { matches } from "./search.js";
import { isSellableType, typeOfKey } from "./itemKey.js";

/* Rendering every match would put >1000 tiles in the DOM. The grid is meant for
 * browsing, so cap it and tell the reader to narrow the search instead of
 * silently truncating. */
const RENDER_CAP = 200;

/* The dropdown offers three kinds of scope: the app's own catalog, the union of
 * every package, or one package. The union is a sentinel because `""` already
 * means "no package filter". */
const UNION = "__all__";

/** The record's own type, or the one spelled by its key. */
function kindOf(key, entry) {
  const suffix = typeOfKey(key);
  if (isSellableType(suffix)) return suffix;
  return entry?.type || "other";
}

function Tile({
  iconUrl,
  title,
  subtitle,
  keyLabel,
  selected,
  added,
  addedLabel,
  groupLabel,
  onToggle,
  onOpenGroup,
}) {
  return (
    <div
      className="rwrsg-pick-tile"
      data-selected={selected ? "true" : undefined}
      data-added={added ? "true" : undefined}
    >
      {/* The main area is the toggle; the group badge is a sibling button, so
          the two actions stay separately reachable by keyboard. */}
      <button
        type="button"
        className="rwrsg-pick-tile-main"
        onClick={onToggle}
        title={`${title || keyLabel} (${keyLabel})`}
        aria-pressed={selected}
      >
        <span className="rwrsg-pick-tile-icon">
          {iconUrl ? (
            <img src={iconUrl} alt="" loading="lazy" />
          ) : (
            <span className="rwrsg-pick-tile-blank" />
          )}
          {selected && (
            <span className="rwrsg-pick-tile-check" aria-hidden="true">
              <CheckOutlined />
            </span>
          )}
          {/* Already in the stall: selecting it again is a no-op, so say so
              rather than letting the click appear to do nothing. */}
          {added && <span className="rwrsg-pick-tile-added">{addedLabel}</span>}
        </span>
        <span className="rwrsg-pick-tile-name">{title || keyLabel}</span>
        {subtitle ? <span className="rwrsg-pick-tile-sub">{subtitle}</span> : null}
        <span className="rwrsg-pick-tile-key">{keyLabel}</span>
      </button>

      {groupLabel && (
        <button type="button" className="rwrsg-pick-tile-group" onClick={onOpenGroup}>
          {groupLabel}
        </button>
      )}
    </div>
  );
}

export default function ItemPicker({ catalog, existingIds, onAdd, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [hideAdded, setHideAdded] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [packageId, setPackageId] = useState("");
  const [openGroup, setOpenGroup] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const inputRef = useRef(null);

  const added = useMemo(() => new Set(existingIds || []), [existingIds]);

  /* Empty means "everything the catalog knows". Otherwise scope to one package,
   * which is what a server actually runs. */
  const isUnion = packageId === UNION;
  const pkg = usePackageIndex(isUnion ? null : packageId || null);
  const union = usePackageUnion();
  const scoped = Boolean(packageId) && !isUnion;

  /* Fetching every package is expensive, so it only starts when asked for. */
  useEffect(() => {
    if (isUnion && union.status === "idle") loadAllPackages();
  }, [isUnion, union.status]);

  const rows = useMemo(() => {
    /* The app's catalog, or one package's slice, or the union of all of them —
     * all reduced to the same row shape. */
    const source = isUnion
      ? union.status === "ready"
        ? union.items
        : null
      : scoped
        ? pkg.status === "ready"
          ? pkg.items
          : null
        : null;

    if (source) {
      return Object.entries(source).map(([key, record]) => {
        const entry = catalog.entries[key];
        return {
          key,
          hudIcon: record.hud_icon || entry?.hud_icon,
          cnName: entry?.cn_name || null,
          enName: entry?.en_name || record.en_name || null,
          kind: kindOf(key, entry),
          chain: record.chain,
        };
      });
    }

    return Object.entries(catalog.entries)
      .filter(([, entry]) => entry?.hud_icon)
      .map(([key, entry]) => ({
        key,
        hudIcon: entry.hud_icon,
        cnName: entry.cn_name || null,
        enName: entry.en_name || null,
        kind: kindOf(key, entry),
        chain: catalog.online.records[key]?.chain,
      }));
  }, [
    isUnion,
    union.status,
    union.items,
    scoped,
    pkg.status,
    pkg.items,
    catalog.entries,
    catalog.online.records,
  ]);

  /* Groups are built from the rows in view, so the same rule works for the whole
   * catalog and for a single package's slice of it. */
  const { groupOf } = useMemo(() => {
    const records = {};
    for (const row of rows) records[row.key] = { type: row.kind, chain: row.chain };
    return buildGroups(records);
  }, [rows]);

  /* One tile per group: the representative stands in for the rest, which are
   * reachable by drilling in. */
  const visibleRows = useMemo(() => {
    if (!grouped) return rows;
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const group = groupOf.get(row.key);
      if (!group) {
        out.push(row);
        continue;
      }
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      out.push({ ...row, group });
    }
    return out;
  }, [rows, grouped, groupOf]);

  /* The relations live in the online data, so grouping has nothing to work with
   * when that source is off or unreachable. Say so rather than silently showing
   * an ungrouped list. */
  const chainAvailable = useMemo(
    () =>
      rows.some(
        (row) => row.chain && (row.chain.next?.length || row.chain.transform),
      ),
    [rows],
  );

  const counts = useMemo(() => {
    const c = { all: visibleRows.length, weapon: 0, carry_item: 0, projectile: 0, other: 0 };
    for (const row of visibleRows) c[row.kind] = (c[row.kind] || 0) + 1;
    return c;
  }, [visibleRows]);

  const results = useMemo(() => {
    /* Drilled into a group: that group's members, in group order. */
    const pool = openGroup
      ? rows.filter((row) => openGroup.members.includes(row.key))
      : visibleRows;
    const out = [];
    for (const row of pool) {
      if (!openGroup && kind !== "all" && row.kind !== kind) continue;
      if (hideAdded && added.has(row.key)) continue;
      if (!matches([row.cnName, row.enName, row.key], query)) continue;
      out.push(row);
    }
    return out;
  }, [rows, visibleRows, openGroup, kind, hideAdded, added, query]);

  const shown = results.slice(0, RENDER_CAP);
  const hidden = results.length - shown.length;

  /* Reset each time the dialog opens, so typing is immediate. */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setKind("all");
    setHideAdded(false);
    setGrouped(true);
    setPackageId("");
    setOpenGroup(null);
    setSelected(new Set());
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  /* Changing the scope invalidates any drill-down. */
  useEffect(() => {
    setOpenGroup(null);
  }, [packageId]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirm = () => {
    if (selected.size === 0) {
      setOpen(false);
      return;
    }
    onAdd([...selected]);
    setOpen(false);
  };

  const groupLabelFor = (group) => {
    if (!group) return null;
    return group.kind === "weapon"
      ? t("picker.configs", { num: group.size })
      : t("picker.states", { num: group.size });
  };

  const packageOptions = [
    { value: "", label: t("picker.allItems") },
    {
      value: UNION,
      label:
        union.status === "loading"
          ? t("picker.unionLoading", { done: union.done, total: union.total })
          : t("picker.unionAll"),
    },
    ...(catalog.online.packages || []).map((id) => ({ value: id, label: id })),
  ];

  const groupRoot = openGroup ? rows.find((row) => row.key === openGroup.representative) : null;

  return (
    <>
      {/* The trigger keeps the shape of the search box it replaced, so the step
          still reads as "search for an item". */}
      <button
        type="button"
        className="rwrsg-pick-trigger"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <SearchOutlined />
        <span>{t("picker.placeholder")}</span>
        <span className="rwrsg-pick-trigger-count">
          {t("picker.total", { num: counts.all })}
        </span>
      </button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={confirm}
        okText={
          selected.size > 0
            ? t("picker.confirmCount", { num: selected.size })
            : t("picker.confirm")
        }
        cancelText={t("picker.cancel")}
        okButtonProps={{ disabled: selected.size === 0 }}
        title={t("picker.title")}
        width="min(980px, 94vw)"
        styles={{ body: { paddingTop: 12 } }}
        destroyOnHidden
      >
        <div className="rwrsg-pick-toolbar">
          <Input
            ref={inputRef}
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t("picker.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={() => {
              /* Enter with exactly one match is the fastest path there is. */
              if (results.length === 1 && !added.has(results[0].key)) {
                onAdd([results[0].key]);
                setOpen(false);
              }
            }}
          />
          <Select
            value={packageId}
            onChange={setPackageId}
            options={packageOptions}
            loading={pkg.status === "loading" || (isUnion && union.status === "loading")}
            style={{ minWidth: 190 }}
            aria-label={t("picker.package")}
            /* 24 options in a virtualised list is a lot to scroll; let people
             * type the package name. */
            showSearch
            optionFilterProp="label"
          />
          <Segmented
            value={kind}
            onChange={setKind}
            disabled={Boolean(openGroup)}
            options={[
              { label: `${t("picker.all")} ${counts.all}`, value: "all" },
              { label: `${t("picker.weapon")} ${counts.weapon}`, value: "weapon" },
              {
                label: `${t("picker.carry_item")} ${counts.carry_item}`,
                value: "carry_item",
              },
              {
                label: `${t("picker.projectile")} ${counts.projectile}`,
                value: "projectile",
              },
            ]}
          />
          <Tooltip title={t("picker.hideAddedHint")}>
            <span className="rwrsg-pick-hide">
              <Switch size="small" checked={hideAdded} onChange={setHideAdded} />
              <span>{t("picker.hideAdded")}</span>
            </span>
          </Tooltip>
          <Tooltip title={t("picker.groupHint")}>
            <span className="rwrsg-pick-hide">
              <Switch
                size="small"
                checked={grouped && chainAvailable}
                onChange={setGrouped}
                disabled={Boolean(openGroup) || !chainAvailable}
              />
              <span>{t("picker.group")}</span>
            </span>
          </Tooltip>
        </div>

        {!chainAvailable && (
          <div className="rwrsg-pick-note">{t("picker.groupUnavailable")}</div>
        )}

        {openGroup && (
          <div className="rwrsg-pick-crumb">
            <Button
              size="small"
              type="text"
              icon={<LeftOutlined />}
              onClick={() => setOpenGroup(null)}
            >
              {t("picker.back")}
            </Button>
            <Typography.Text type="secondary">
              {t("picker.groupHeading", {
                name: groupRoot?.cnName || groupRoot?.enName || openGroup.representative,
                num: openGroup.size,
              })}
            </Typography.Text>
          </div>
        )}

        {isUnion && union.status === "loading" ? (
          <div className="rwrsg-pick-loading">
            {t("picker.unionProgress", {
              done: union.done,
              total: union.total,
              items: Object.keys(union.items).length,
            })}
          </div>
        ) : isUnion && union.status === "error" ? (
          <div className="rwrsg-pick-loading">{t("picker.unionError")}</div>
        ) : pkg.status === "loading" ? (
          <div className="rwrsg-pick-loading">{t("picker.loadingPackage")}</div>
        ) : pkg.status === "error" ? (
          <div className="rwrsg-pick-loading">{t("picker.packageError")}</div>
        ) : shown.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("picker.empty")}
            style={{ padding: "40px 0" }}
          />
        ) : (
          <div className="rwrsg-pick-grid">
            {shown.map((row) => (
              <Tile
                key={row.key}
                iconUrl={catalog.iconUrl(row.hudIcon)}
                title={row.cnName}
                subtitle={row.cnName ? row.enName : null}
                keyLabel={row.key}
                selected={selected.has(row.key)}
                added={added.has(row.key)}
                addedLabel={t("picker.inList")}
                groupLabel={
                  !openGroup && row.group ? groupLabelFor(row.group) : null
                }
                onToggle={() => toggle(row.key)}
                onOpenGroup={() => setOpenGroup(row.group)}
              />
            ))}
          </div>
        )}

        <div className="rwrsg-pick-footer">
          <span>
            {hidden > 0
              ? t("picker.more", { num: hidden })
              : t("picker.showing", { shown: shown.length, total: results.length })}
          </span>
          {selected.size > 0 && (
            <span>{t("picker.selected", { num: selected.size })}</span>
          )}
        </div>
      </Modal>
    </>
  );
}
