import React, { useContext, useMemo } from "react";
import {
  AppstoreOutlined,
  CloudOutlined,
  CloudSyncOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DollarCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  GithubOutlined,
  HolderOutlined,
  HomeOutlined,
  LeftCircleOutlined,
  LinkOutlined,
  LoadingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  RightCircleFilled,
  SunOutlined,
  SwitcherOutlined,
  TableOutlined,
  TranslationOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Card,
  Col,
  Collapse,
  ColorPicker,
  ConfigProvider,
  Divider,
  Dropdown,
  Flex,
  Image,
  Input,
  InputNumber,
  Layout,
  Menu,
  message,
  Modal,
  Row,
  Slider,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  theme,
  Timeline,
  Tooltip,
  // Tour,
  Typography,
  Upload,
  Watermark,
} from "antd";
import { Button, Steps } from "antd";
import logo from "./assets/icon.png";
// import thumbUp from "./assets/emoticon_thumbup_gray.png";
// import smile from "./assets/emoticon_smiley_gray.png";
import Title from "antd/es/typography/Title";
import Marquee from "react-fast-marquee";
import fs from "file-saver";
import html2canvas from "html2canvas";
import moment from "moment";
import { useVercount } from "vercount-react";
import CountUp from "react-countup";
import priceData from "./price.json";
import priceTxt from "./og_price.json";
import useLocalStorageState from "use-local-storage-state";
import { Route, Routes, useNavigate } from "react-router-dom";
import RwrTable from "./Table";
import { useTranslation } from "react-i18next";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCatalog } from "./catalog.js";
import { setOnlineEnabled, wikiUrl } from "./onlineSource.js";
import {
  INVENTORY_EVENT,
  dedupeRows,
  parseInventoryImport,
  readInventory,
  resolveInventory,
  rowId,
} from "./inventory.js";
import PromoBanner from "./PromoBanner.jsx";
import ItemPicker from "./ItemPicker.jsx";
import { unitTrans } from "./format.js";

const formatter = (value) => <CountUp end={value} separator="," />;

const { Header, Content, Footer, Sider } = Layout;
const ToggleSidebarButton = ({ collapsed, onToggle }) => {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 1000,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      {collapsed ? (
        <Button type="primary" icon={<MenuUnfoldOutlined />} />
      ) : (
        <Button type="primary" icon={<MenuFoldOutlined />} />
      )}
    </div>
  );
};

const lines = [
  "梦想只是梦想，不能当饭吃。那我就不吃。我只是害怕如果我今天死掉，或许就这样一事无成，过完一生。——《心灵奇旅》",
  "由衷感谢所有对本项目提供帮助的游戏玩家以及社区成员。30年后有人问起RWR是什么，哦，那是一个漫长而愉快的梦。",
  "圣诞快乐，劳伦斯先生。",
  "强者救赎自己，圣人普度他人。——《肖申克的救赎》",
  "希望是美好的，也许是人间至善，而美好的事物永不消逝。——《肖申克的救赎》",
  "有的鸟终究是关不住的，因为他们的羽翼太过光辉——《肖申克的救赎》",
];

/* ── the commit timeline ──────────────────────────────────────────────────── */

/* The canonical repo. `bananaxiao2333/rwrsg` still 301s here, but every hop is
 * a wasted round trip, and the badges below should not depend on a redirect. */
const REPO = "rwr-infra/rwrsg";
const COMMITS_URL = `https://api.github.com/repos/${REPO}/commits`;
const COMMITS_CACHE_KEY = "rwrsg.commits";

/* Unauthenticated GitHub allows 60 requests an hour, and this used to fire on
 * every mount without checking `response.ok` — so a few reloads could exhaust
 * the quota and leave the timeline blank forever, with nothing reported. Cache
 * the *data* for the tab; the JSX is built at render. */
function readCommitCache() {
  try {
    const raw = sessionStorage.getItem(COMMITS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCommitCache(list) {
  try {
    sessionStorage.setItem(COMMITS_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* private mode — the timeline simply refetches next time */
  }
}

/** Reduce the API payload to the three fields the timeline renders. */
const extractCommitInfo = (commits) =>
  commits.map((commit) => ({
    date: commit?.commit?.author?.date || "",
    message: commit?.commit?.message || "",
    url: commit?.html_url || "",
  }));

/** Shown for any route that does not exist. */
const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  React.useEffect(() => {
    /* Was a `<meta http-equiv="refresh">` inside the component: an invalid DOM
     * prop name, and it reloaded the whole app instead of routing. */
    const id = window.setTimeout(() => navigate("/", { replace: true }), 3000);
    return () => window.clearTimeout(id);
  }, [navigate]);
  return <Typography>{t("notFound")}</Typography>;
};

const RowContext = React.createContext({});
const DragHandle = () => {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <Button
      type="text"
      size="small"
      icon={<HolderOutlined />}
      style={{ cursor: "move" }}
      ref={setActivatorNodeRef}
      {...listeners}
    />
  );
};

const DRow = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props["data-row-key"] });
  const style = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  };
  const contextValue = useMemo(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners],
  );
  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  );
};

const App = () => {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = React.useState(false);

  const onDragEnd = ({ active, over }) => {
    if (active.id !== over?.id) {
      setData((prevState) => {
        const activeIndex = prevState.findIndex(
          (record) => rowId(record) === active?.id,
        );
        const overIndex = prevState.findIndex(
          (record) => rowId(record) === over?.id,
        );
        return arrayMove(prevState, activeIndex, overIndex);
      });
    }
  };

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  const navItem = [
    {
      key: "1",
      label: t("pages"),
      icon: <FileOutlined />,
      children: [
        {
          key: "1.1",
          label: <a href="/#/">{t("home")}</a>,
          icon: <HomeOutlined />,
        },
        {
          key: "1.2",
          label: <a href="/#/table">{t("table")}</a>,
          icon: <TableOutlined />,
        },
      ],
    },
    {
      key: "2",
      label: t("experi"),
      icon: <TranslationOutlined />,
      children: [
        {
          key: "zh",
          label: "中文",
          icon: <SwitcherOutlined />,
        },
        {
          key: "en",
          label: "English",
          icon: <SwitcherOutlined />,
        },
      ],
    },
  ];

  const [commitHistory, setCommitHistory] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    const fetchCommits = async () => {
      const cached = readCommitCache();
      if (cached) {
        if (!cancelled) setCommitHistory(cached);
        return;
      }
      try {
        const response = await fetch(COMMITS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const jsonData = await response.json();
        if (!Array.isArray(jsonData)) throw new Error("unexpected payload");
        const list = extractCommitInfo(jsonData);
        writeCommitCache(list);
        if (!cancelled) setCommitHistory(list);
      } catch {
        /* Offline, rate-limited, or the payload changed shape. The timeline is
         * decoration — an empty one beats an error, and the page keeps working. */
        if (!cancelled) setCommitHistory([]);
      }
    };
    fetchCommits();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Built here, not in the fetch: the cached payload is plain data, so the JSX
   * is the one thing that must not be what gets stored. */
  const timelineItems = React.useMemo(
    () =>
      (commitHistory || []).map((commit) => ({
        label: commit.date,
        children: <a href={commit.url}>{commit.message}</a>,
      })),
    [commitHistory],
  );

  const getRandomItem = () => {
    const randomIndex = Math.floor(Math.random() * lines.length);
    return lines[randomIndex];
  };
  const [randomItem, setRandomItem] = React.useState("");
  React.useEffect(() => {
    setRandomItem(getRandomItem());
  }, []);

  /* The bundled snapshot plus whatever the online source can contribute.
   * Bundled entries are never modified, so this is a superset of what rwrsg
   * shipped and every existing row renders exactly as before. */
  const catalog = useCatalog();
  const { entries } = catalog;
  const itemCount = Object.keys(entries).length;

  /* A spinner only while the online layer answers for the first time. A cached
   * or switched-off source settles immediately, so returning users see nothing. */
  const spinning =
    catalog.online.status === "loading" && !catalog.online.fromCache;

  /* Announce the catalog once it has settled, so the count includes whatever
   * the online source contributed instead of under-reporting mid-fetch. */
  const announced = React.useRef(false);
  const catalogSettled =
    catalog.online.status === "ready" ||
    catalog.online.status === "error" ||
    catalog.online.status === "disabled";
  React.useEffect(() => {
    if (!catalogSettled || announced.current) return;
    announced.current = true;
    message.open({
      type: "info",
      content: t("app.currentTip", { num: itemCount }),
      duration: 3,
    });
  }, [catalogSettled, itemCount, t]);

  /* One line explaining what the online layer is currently doing, so the switch
   * in the header is never a mystery. */
  const onlineStatusText = React.useMemo(() => {
    const s = catalog.online;
    if (!s.enabled) return t("online.off");
    if (s.status === "loading") return t("online.loading");
    if (s.status === "error") return t("online.error");
    if (s.status === "ready")
      return t("online.on", { pkg: s.packageId || "—", num: catalog.added });
    return t("online.loading");
  }, [catalog.online, catalog.added, t]);

  const [currentTime, setCurrentTime] = React.useState(new moment().format());
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new moment().format());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);


  const ref1 = React.useRef(null);
  const ref2 = React.useRef(null);
  const ref3 = React.useRef(null);
  const ref4 = React.useRef(null);
  const ref5 = React.useRef(null);
  const [data, setData] = useLocalStorageState("data", {
    defaultValue: [
      { key: "lottery", name: "彩票", price: 1700, num: 1 },
      { key: "vest3", name: "Ⅲ型防弹背心", price: 200, num: 2 },
      { key: "aug", name: "斯太尔AUG突击步枪", price: 250, num: 5 },
    ],
  });

  /* Rows saved between 2025-12-29 and 2026-01-31 key on `<key>.<type>`, which
   * no PNG matches — they have been rendering a broken image ever since the key
   * changed. Rewrite just those keys. Only `key` moves: name, price and
   * quantity are carried over, and a row that resolves to nothing is left
   * exactly as it was.
   *
   * Deliberately not gated on the online layer: the resolution comes from the
   * bundled catalog, which is available synchronously. The effect is idempotent
   * — once every key resolves, `resolveInventory` returns the same array and
   * nothing is written — so it can safely re-run when the online layer lands. */
  React.useEffect(() => {
    const fixed = resolveInventory(data, catalog);
    if (fixed !== data) setData(fixed);
  }, [data, catalog, setData]);

  /* The workbench writes straight to storage, so it announces the write and the
   * stall re-reads. It also persists the starter rows on first mount, so the
   * workbench's first add appends to them rather than replacing them. */
  React.useEffect(() => {
    if (readInventory().length === 0 && data.length > 0) setData(data);
    const onWrite = () => setData(readInventory());
    window.addEventListener(INVENTORY_EVENT, onWrite);
    return () => window.removeEventListener(INVENTORY_EVENT, onWrite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setData]);

  /* Resolved once for rendering and for every mutation, so the identity used to
   * look a row up is always the identity that was stored. */
  const rows = React.useMemo(
    () => resolveInventory(data, catalog),
    [data, catalog],
  );

  /* The picker hands back hud icons; prices and de-duping belong here, where
   * the stall rows live. */
  const handleAddItems = (itemKeys) => {
    const addedRows = itemKeys.map((itemKey) => {
      const entry = catalog.entries[itemKey];
      /* `entry` is keyed by the record key; its hud_icon is what the stall
       * renders. Falling back to the key itself keeps an item the catalog has
       * never seen from being dropped. */
      const hudIcon = entry?.hud_icon || itemKey;
      return {
        /* The hud icon: what the stall renders, and the field every version of
         * rwrsg has written. Not unique, so `itemKey` carries the identity. */
        key: hudIcon,
        itemKey,
        /* An online-only item has no Chinese name yet — an English label beats
         * a row reading "未设定". */
        name: entry?.cn_name || entry?.en_name || itemKey,
        price: priceData[hudIcon] ?? 0,
      };
    });
    setData(dedupeRows(rows.concat(addedRows)));
    message.open({
      type: "success",
      content: t("add") + " " + addedRows.map((row) => row.name).join(", "),
      duration: 3,
    });
  };

  const columns = [
    { key: "sort", align: "center", width: 80, render: () => <DragHandle /> },
    {
      title: t("pic"),
      dataIndex: "key",
      key: "key",
      render: (text) => (
        <>
          <Image
            width={50}
            src={catalog.iconUrl(text)}
            fallback="data:image/png;base64,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"
          />
        </>
      ),
    },
    {
      title: t("key"),
      dataIndex: "key",
      key: "key",
    },
    {
      title: t("action"),
      key: "delete",
      render: (_, record) => (
        <Space size={2}>
          {/* Straight to the item's full article on the wiki. */}
          {wikiUrl(record.itemKey || record.key, catalog.online.packageId) && (
            <Tooltip title={t("openInWiki")}>
              <Button
                icon={<LinkOutlined />}
                href={wikiUrl(record.itemKey || record.key, catalog.online.packageId)}
                target="_blank"
                rel="noreferrer"
                aria-label={t("openInWiki")}
              />
            </Tooltip>
          )}
          <Button
            icon={<DeleteOutlined />}
            danger
            aria-label={t("delete")}
            onClick={() => {
              /* Delete by identity, not by icon — several rows can share one. */
              setData(rows.filter((item) => rowId(item) !== rowId(record)));

              if (rowId(record).length > 0)
                message.open({
                  type: "success",
                  content: t("delete") + " " + record.name,
                  duration: 3,
                });
            }}
            style={{ textWrap: "wrap" }}
          />
        </Space>
      ),
    },
  ];
  const [editKey, setEditKey] = React.useState("");
  const [editMode, setEditMode] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const columns2 = [
    {
      title: t("pic") + "/" + t("key"),
      dataIndex: "key",
      key: "key",
      fixed: "right",
      render: (text, record) => (
        <div>
          <Image
            width={50}
            src={catalog.iconUrl(text)}
            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3PTWBSGcbGzM6GCKqlIBRV0dHRJFarQ0eUT8LH4BnRU0NHR0UEFVdIlFRV7TzRksomPY8uykTk/zewQfKw/9znv4yvJynLv4uLiV2dBoDiBf4qP3/ARuCRABEFAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghgg0Aj8i0JO4OzsrPv69Wv+hi2qPHr0qNvf39+iI97soRIh4f3z58/u7du3SXX7Xt7Z2enevHmzfQe+oSN2apSAPj09TSrb+XKI/f379+08+A0cNRE2ANkupk+ACNPvkSPcAAEibACyXUyfABGm3yNHuAECRNgAZLuYPgEirKlHu7u7XdyytGwHAd8jjNyng4OD7vnz51dbPT8/7z58+NB9+/bt6jU/TI+AGWHEnrx48eJ/EsSmHzx40L18+fLyzxF3ZVMjEyDCiEDjMYZZS5wiPXnyZFbJaxMhQIQRGzHvWR7XCyOCXsOmiDAi1HmPMMQjDpbpEiDCiL358eNHurW/5SnWdIBbXiDCiA38/Pnzrce2YyZ4//59F3ePLNMl4PbpiL2J0L979+7yDtHDhw8vtzzvdGnEXdvUigSIsCLAWavHp/+qM0BcXMd/q25n1vF57TYBp0a3mUzilePj4+7k5KSLb6gt6ydAhPUzXnoPR0dHl79WGTNCfBnn1uvSCJdegQhLI1vvCk+fPu2ePXt2tZOYEV6/fn31dz+shwAR1sP1cqvLntbEN9MxA9xcYjsxS1jWR4AIa2Ibzx0tc44fYX/16lV6NDFLXH+YL32jwiACRBiEbf5KcXoTIsQSpzXx4N28Ja4BQoK7rgXiydbHjx/P25TaQAJEGAguWy0+2Q8PD6/Ki4R8EVl+bzBOnZY95fq9rj9zAkTI2SxdidBHqG9+skdw43borCXO/ZcJdraPWdv22uIEiLA4q7nvvCug8WTqzQveOH26fodo7g6uFe/a17W3+nFBAkRYENRdb1vkkz1CH9cPsVy/jrhr27PqMYvENYNlHAIesRiBYwRy0V+8iXP8+/fvX11Mr7L7ECueb/r48eMqm7FuI2BGWDEG8cm+7G3NEOfmdcTQw4h9/55lhm7DekRYKQPZF2ArbXTAyu4kDYB2YxUzwg0gi/41ztHnfQG26HbGel/crVrm7tNY+/1btkOEAZ2M05r4FB7r9GbAIdxaZYrHdOsgJ/wCEQY0J74TmOKnbxxT9n3FgGGWWsVdowHtjt9Nnvf7yQM2aZU/TIAIAxrw6dOnAWtZZcoEnBpNuTuObWMEiLAx1HY0ZQJEmHJ3HNvGCBBhY6jtaMoEiJB0Z29vL6ls58vxPcO8/zfrdo5qvKO+d3Fx8Wu8zf1dW4p/cPzLly/dtv9Ts/EbcvGAHhHyfBIhZ6NSiIBTo0LNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiEC/wGgKKC4YMA4TAAAAABJRU5ErkJggg=="
          />
          <Button
            type="link"
            size="small"
            autoInsertSpace={false}
            onClick={() => {
              (setEditKey(record),
                setEditMode("name"),
                setEditModal(record.name),
                setIsModalOpen(true));
            }}
          >
            {record.name ? <>{record.name}</> : <>{t("unset")}</>}
          </Button>
        </div>
      ),
    },
    {
      title: t("key"),
      dataIndex: "key",
      key: "key",

      responsive: ["sm"],
    },
    {
      title: t("price") + "(rp)",
      dataIndex: "price",
      key: "price",
      sorter: (a, b) => a.price - b.price,

      render: (text, record) => (
        <>
          <Button
            type="link"
            autoInsertSpace={false}
            onClick={() => {
              (setEditKey(record),
                setEditMode("price"),
                setEditModal(record.price),
                setIsModalOpen(true));
            }}
          >
            {text ? <>{text}rp</> : <>{t("unset")}</>}
          </Button>
        </>
      ),
    },
    {
      title: t("num"),
      dataIndex: "num",
      key: "num",
      sorter: (a, b) => a.num - b.num,

      render: (text, record) => (
        <>
          <Button
            type="link"
            autoInsertSpace={false}
            onClick={() => {
              (setEditKey(record),
                setEditMode("num"),
                setEditModal(record.num),
                setIsModalOpen(true));
            }}
          >
            {text ? <>{text}</> : <>{t("unset")}</>}
          </Button>
        </>
      ),
    },
  ];

  const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
  const onSelectChange = (newSelectedRowKeys) => {
    setSelectedRowKeys(newSelectedRowKeys);
  };
  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
      {
        key: "delete",
        onSelect: () => {
          //console.log("orgin data:", data);
          //console.log("rows to del:", selectedRowKeys);
          const doomed = new Set(selectedRowKeys);
          const newData = rows.filter((item) => !doomed.has(rowId(item)));
          setData(newData);
          if (selectedRowKeys.join().length > 0)
            message.open({
              type: "success",
              content: t("delete") + " " + selectedRowKeys.join(),
              duration: 3,
            });
          setSelectedRowKeys([]);
        },
      },
    ],
  };
  const [editModal, setEditModal] = React.useState();
  const canvasRef = React.useRef(null);
  const [editableStr, setEditableStr] = useLocalStorageState("title", {
    defaultValue: t("rwrsg"),
  });
  const [discount, setDiscount] = useLocalStorageState("discount", {
    defaultValue: 0,
  });
  const [picWidth, setPicWidth] = useLocalStorageState("picWidth");
  const [showName, setShowName] = useLocalStorageState("showName", {
    defaultValue: false,
  });
  const [showPrice, setShowPrice] = useLocalStorageState("showPrice", {
    defaultValue: true,
  });
  const [showID, setShowID] = useLocalStorageState("showID", {
    defaultValue: false,
  });
  const [showTitle, setShowTitle] = useLocalStorageState("showTitle", {
    defaultValue: false,
  });
  const [showNum, setShowNum] = useLocalStorageState("showNum", {
    defaultValue: false,
  });
  const [transUnit, setTransUnit] = useLocalStorageState("transUnit", {
    defaultValue: true,
  });
  const [original, setOriginal] = useLocalStorageState("original", {
    defaultValue: true,
  });
  const [color, setColor] = useLocalStorageState("color", {
    defaultValue: "#ffffff",
  });
  const [txtColor, setTxtColor] = useLocalStorageState("txtColor", {
    defaultValue: "#000000",
  });
  const [useFont, setUseFont] = useLocalStorageState("useFont", {
    defaultValue: true,
  });
  const { Paragraph, Text } = Typography;
  const [pageS, setPageS] = React.useState({
    pageSize: 30,
    showSizeChanger: true,
    showTotal: (total) => `${total}`,
  });

  /* Eight switches, all the same shape: a stored boolean, and a label for each
   * state. Written out longhand this was 40 lines of copy-paste with the
   * Chinese baked in, so English users saw Chinese for the whole export step. */
  const exportToggles = [
    { key: "showName", value: showName, set: setShowName, on: "step.showName", off: "step.hideName" },
    { key: "showID", value: showID, set: setShowID, on: "step.showId", off: "step.hideId" },
    { key: "showPrice", value: showPrice, set: setShowPrice, on: "step.showPrice", off: "step.hidePrice" },
    { key: "transUnit", value: transUnit, set: setTransUnit, on: "step.convertUnit", off: "step.keepUnit" },
    { key: "showNum", value: showNum, set: setShowNum, on: "step.showStock", off: "step.hideStock" },
    { key: "original", value: original, set: setOriginal, on: "step.gameStyle", off: "step.listStyle" },
    { key: "showTitle", value: showTitle, set: setShowTitle, on: "step.showDataTitle", off: "step.hideDataTitle" },
    { key: "useFont", value: useFont, set: setUseFont, on: "step.useFont", off: "step.noFont" },
  ];

  const steps = [
    {
      title: t("app.items"),
      content: (
        <>
          <Row style={{ justifyContent: "space-evenly" }}>
            <Col xs={{ flex: "100%" }} sm={{ flex: "70%" }}>
              <div ref={ref4}>
                <DndContext
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={rows.map(rowId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <Table
                      rowKey={rowId}
                      components={{ body: { row: DRow } }}
                      size="small"
                      rowSelection={rowSelection}
                      columns={columns}
                      dataSource={rows}
                      pagination={pageS}
                      onChange={(pagination) => {
                        setPageS(pagination);
                      }}
                    />
                  </SortableContext>
                </DndContext>
              </div>
            </Col>
            <Col xs={{ flex: "100%" }} sm={{ flex: "25%" }}>
              <Card
                title={t("app.add_items")}
                variant="borderless"
                style={{ height: "100%" }}
              >
                <div ref={ref3} style={{ height: "100%", minWidth: "0" }}>
                  <ItemPicker
                    catalog={catalog}
                    existingIds={rows.map(rowId)}
                    onAdd={handleAddItems}
                  />
                  <Alert
                    type="info"
                    closable
                    message={t("app.tip1")}
                    showIcon
                    style={{ margin: "10px 0" }}
                  />
                  <Collapse
                    accordion
                    items={[
                      {
                        key: "1",
                        label: t("app.tip2"),
                        children: <p>{priceTxt["txt"]}</p>,
                      },
                    ]}
                    style={{ whiteSpace: "pre-wrap" }}
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      title: t("property"),
      content: (
        <>
          {/* `virtual` renders **nothing** here. rc-table's virtual body only
              draws rows when its own scroll container has a measured size, and
              inside this step it never gets one — the table showed its header
              and an empty body, which is why this step looked broken.
              The table paginates, so there is nothing to virtualise anyway: at
              most one page of rows is ever in the DOM. */}
          <Table
            size="small"
            columns={columns2}
            dataSource={rows}
            pagination={{ pageSize: 30, showSizeChanger: true }}
          />
          <Modal
            title={t("step.setField", {
              name: `${editKey.key} (${editKey.name})`,
              field: t(`step.field.${editMode}`),
            })}
            open={isModalOpen}
            onOk={() => {
              /* Match on identity: several rows can share one hud icon. Also
               * write a new object rather than mutating the row in place, so
               * React sees the change. */
              const target = rowId(editKey);
              setData(
                rows.map((item) =>
                  rowId(item) === target
                    ? { ...item, [editMode]: editModal }
                    : item,
                ),
              );
              setIsModalOpen(false);
            }}
            onCancel={() => setIsModalOpen(false)}
          >
            {editMode == "name" ? (
              <Input
                style={{ width: "50%" }}
                value={editModal}
                onChange={(event) => setEditModal(event.target.value)}
              />
            ) : (
              <InputNumber
                suffix={editMode == "price" ? "rp" : ""}
                style={{ width: "50%" }}
                value={editModal}
                onChange={(value) => setEditModal(value)}
              />
            )}
          </Modal>
        </>
      ),
    },
    {
      title: t("app.save"),
      content: (
        <>
          <Alert message={t("step.widthHint")} closable showIcon />
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                border: "2px solid #0000FF",
                borderStyle: "dashed",
                backgroundColor: color,
              }}
            >
              <div
                ref={canvasRef}
                style={Object.assign(
                  { backgroundColor: color },
                  picWidth ? { width: picWidth + "px" } : {},
                )}
              >
                <Watermark
                  //height={88 / 4}
                  //width={700 / 4}
                  content={[editableStr, currentTime]}
                  //image={rwrIcon}
                >
                  <ConfigProvider
                    theme={{
                      token: {
                        colorText: txtColor,
                        colorTextDescription: txtColor,
                        fontFamily: useFont ? "komikax" : "",
                      },
                    }}
                  >
                    <Typography.Title
                      editable={{
                        tooltip: t("step.editTitle"),
                        onChange: setEditableStr,
                      }}
                      style={{ textAlign: "center", margin: "0" }}
                    >
                      {editableStr}
                    </Typography.Title>
                    <Flex wrap gap="small" justify="center">
                      {/* The *resolved* rows, the same array the items table
                          renders. Rendering raw storage meant a legacy row
                          showed a broken image until the migration effect
                          happened to rewrite it; and `key={item.key}` used the
                          hud icon, which 507 of the 948 records share, so a
                          real stall produced duplicate React keys. */}
                      {rows.map((item) => (
                        <div
                          key={rowId(item)}
                          className="grid-item"
                          style={{
                            lineHeight: "0",
                            textAlign: "center",
                            minHeight: "100%",
                            position: "relative", // 添加相对定位
                          }}
                        >
                          <div // 图片容器
                            style={{
                              maxHeight: "200px",
                              width: "100%",
                              alignContent: "center",
                              position: "relative", // 添加相对定位
                            }}
                          >
                            {/* A legacy row whose item no longer exists has no
                                icon at all. Rendering <img src={null}> paints
                                the browser's broken-image glyph into the
                                exported picture; a neutral placeholder does not
                                pretend the item is fine, it just fails quietly. */}
                            {catalog.iconUrl(item.key) ? (
                              <img
                                src={catalog.iconUrl(item.key)}
                                alt={item.name || item.key}
                                style={{
                                  maxHeight: "200px",
                                  maxWidth: "100px",
                                  margin: "0 0",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  height: "100px",
                                  width: "100px",
                                  margin: "0 auto",
                                  border: "1px dashed currentColor",
                                  opacity: 0.35,
                                }}
                                title={item.key}
                              />
                            )}

                            {/* 新增：当original为true时显示库存标签 */}
                            {original && showNum && item.num !== undefined && (
                              <Typography
                                style={{
                                  position: "absolute",
                                  bottom: "4px",
                                  right: "4px",
                                  fontSize: "28px",
                                  lineHeight: "1.5",
                                }}
                              >
                                {item.num}
                              </Typography>
                            )}
                          </div>

                          {showName ? (
                            <Typography.Title
                              style={{ margin: "0", width: "120px" }}
                              level={5}
                            >
                              {item.name}
                            </Typography.Title>
                          ) : (
                            ""
                          )}

                          {showID ? (
                            <Typography>
                              {"("}
                              {item.key}
                              {")"}
                            </Typography>
                          ) : (
                            ""
                          )}

                          {showPrice ? (
                            <Statistic
                              title={showTitle ? t("step.unitPrice") : ""}
                              prefix={<DollarCircleOutlined />}
                              value={
                                item.price
                                  ? (transUnit
                                      ? unitTrans(
                                          (item.price * (1 - discount)).toFixed(
                                            0,
                                          ),
                                        )
                                      : (item.price * (1 - discount)).toFixed(
                                          0,
                                        )) + " rp"
                                  : "N/A"
                              }
                            />
                          ) : (
                            ""
                          )}

                          {discount ? (
                            <Typography
                              style={{
                                height: "30px",
                                backgroundColor: "#006400", // 深绿色
                                color: "white",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                fontSize: "18px",
                              }}
                            >
                              -{discount * 100}%
                            </Typography>
                          ) : (
                            ""
                          )}

                          {/* 修改：当original为false时才显示库存统计 */}
                          {showNum && !original ? (
                            <Statistic
                              title={showTitle ? t("step.stockCount") : ""}
                              prefix={<AppstoreOutlined />}
                              value={item.num ? t("step.pieces", { num: item.num }) : "N/A"}
                            />
                          ) : (
                            ""
                          )}
                        </div>
                      ))}
                    </Flex>
                  </ConfigProvider>
                </Watermark>
              </div>
            </div>
          </div>
          <Card title={t("step.exportSettings")}>
            <div
              style={{
                gap: "20px",
                width: "100%",
                display: "flex",
                justifyContent: "space-around",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {/* `Slider` accepts none of `placeholder`, `suffix` or
                    `changeOnWheel` — all three were spread onto its root <div>
                    as invalid DOM attributes. */}
                <Slider
                  aria-label={t("step.width")}
                  value={picWidth}
                  onChange={(value) => setPicWidth(value)}
                  min={1}
                  max={2000}
                  style={{ width: "200px" }}
                />
                <InputNumber
                  aria-label={t("step.width")}
                  placeholder={t("step.width")}
                  value={picWidth}
                  onChange={(value) => setPicWidth(value)}
                  suffix="px"
                  changeOnWheel
                  min={1}
                />
                <Button type="dashed" onClick={() => setPicWidth(470)}>
                  {t("step.phoneWidth")}
                </Button>
              </div>
              {exportToggles.map((toggle) => (
                <Switch
                  key={toggle.key}
                  checkedChildren={t(toggle.on)}
                  unCheckedChildren={t(toggle.off)}
                  checked={toggle.value}
                  onChange={() => toggle.set(!toggle.value)}
                />
              ))}
              <ColorPicker
                showText
                format="hex"
                value={color}
                onChange={(value) => setColor(value.toHexString())}
              />
              <ColorPicker
                showText
                format="hex"
                value={txtColor}
                onChange={(value) => setTxtColor(value.toHexString())}
              />

              <InputNumber
                aria-label={t("step.discount")}
                placeholder={t("step.discount")}
                value={discount}
                onChange={(value) => setDiscount(value)}
                suffix="x"
                changeOnWheel
                min={0}
                max={1}
              />
            </div>
          </Card>
        </>
      ),
    },
  ];
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();
  const { token } = theme.useToken();
  const [current, setCurrent] = React.useState(0);
  const next = () => {
    setCurrent(current + 1);
  };
  const prev = () => {
    setCurrent(current - 1);
  };
  const items = steps.map((item) => ({ key: item.title, title: item.title }));
  const contentStyle = {
    lineHeight: "260px",
    textAlign: "center",
    color: token.colorTextTertiary,
    backgroundColor: token.colorFillAlter,
    borderRadius: token.borderRadiusLG,
    border: `1px dashed ${token.colorBorder}`,
    marginTop: 16,
  };

  const props = {
    name: "file",
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        /* An export is a JSON array of rows. Anything else — a truncated
         * download, a file picked by mistake — used to be concatenated as one
         * bogus row, or throw uncaught inside `onload` where the user never saw
         * it. Neither said anything. */
        const { rows: imported, reason } = parseInventoryImport(reader.result);
        if (reason) {
          message.open({
            type: "error",
            content: t("importFailed", { msg: t(reason) }),
            duration: 5,
          });
          return;
        }
        setData(dedupeRows(data.concat(imported)));
        message.open({
          type: "success",
          content: t("imported", { num: imported.length }),
          duration: 3,
        });
      };
      reader.onerror = () =>
        message.open({
          type: "error",
          content: t("importFailed", { msg: t("importReadError") }),
          duration: 5,
        });
      reader.readAsText(file);
      return false; // the file is read locally, never uploaded
    },
  };
  /* Appearance: follow the system by default, with an explicit override. Stored
   * under `theme` alongside the other rwrsg preferences. */
  const [themeMode, setThemeMode] = useLocalStorageState("theme", {
    defaultValue: "auto",
  });
  const [systemDark, setSystemDark] = React.useState(() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => setSystemDark(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isBright = themeMode === "light" || (themeMode === "auto" && !systemDark);

  /* Drive the custom properties in app.css from the resolved theme, so they can
   * never disagree with antd's algorithm. */
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-rwrsg-theme", isBright ? "light" : "dark");
    /* Lets the browser paint native widgets (scrollbars, form controls) to
     * match instead of staying stubbornly light. */
    root.style.colorScheme = isBright ? "light" : "dark";
  }, [isBright]);

  const { sitePv, pagePv, siteUv } = useVercount();

  return (
    <ConfigProvider theme={isBright ? {} : { algorithm: theme.darkAlgorithm }}>
      <Layout style={{ height: "100vh" }}>
        {/* A legal notice, not an alert. The default info-blue band was the
            loudest element on the page; this is a quiet neutral strip. */}
        <div className="rwrsg-notice">
          <Marquee pauseOnHover gradient={false}>
            {t("topWarn", { year: new Date().getFullYear() })}
          </Marquee>
        </div>
        <PromoBanner />
        <Header
          className="rwrsg-header"
          style={{
            position: "sticky",
            top: "0px",
            zIndex: 1,
            width: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          <img src={logo} alt="RWRSG" className="rwrsg-header-logo" />
          <Title level={3} className="rwrsg-header-title">
            RWRSG
          </Title>
          <div style={{ flex: 1 }} />
          <div className="rwrsg-header-controls">
            <Tooltip title={onlineStatusText} placement="bottomRight">
              <Switch
                checkedChildren={<CloudSyncOutlined />}
                unCheckedChildren={<CloudOutlined />}
                checked={catalog.online.enabled}
                loading={catalog.online.status === "loading"}
                onChange={(value) => setOnlineEnabled(value)}
                aria-label={t("online.label")}
              />
            </Tooltip>
            {/* Three states, so a single toggle cannot express it. The trigger
                shows the mode that is actually in effect. */}
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                selectable: true,
                selectedKeys: [themeMode],
                onClick: ({ key }) => setThemeMode(key),
                items: [
                  { key: "auto", label: t("theme.auto"), icon: <DesktopOutlined /> },
                  { key: "light", label: t("theme.light"), icon: <SunOutlined /> },
                  { key: "dark", label: t("theme.dark"), icon: <MoonOutlined /> },
                ],
              }}
            >
              <Button
                type="text"
                className="rwrsg-theme-trigger"
                aria-label={t("theme.label")}
                icon={
                  themeMode === "auto" ? (
                    <DesktopOutlined />
                  ) : isBright ? (
                    <SunOutlined />
                  ) : (
                    <MoonOutlined />
                  )
                }
              />
            </Dropdown>
          </div>
        </Header>
        <Layout>
          {collapsed ? (
            <Sider
              style={{ background: colorBgContainer, overflow: "hidden" }}
              breakpoint="lg"
            >
              <Menu
                mode="inline"
                defaultOpenKeys={["1"]}
                style={{ height: "100%", borderInlineEnd: 0 }}
                items={navItem}
                onClick={(key) =>
                  ["zh", "en"].indexOf(key["key"]) !== -1
                    ? i18n.changeLanguage(key["key"])
                    : ""
                }
              />
            </Sider>
          ) : (
            <></>
          )}

          <div style={{ overflow: "auto", flex: "1" }} ref={ref5}>
            <ToggleSidebarButton
              collapsed={collapsed}
              onToggle={toggleSidebar}
            />
            <Content style={{ padding: "16px 16px" }}>
              <div
                style={{
                  padding: 24,
                  borderRadius: borderRadiusLG,
                }}
              >
                <Routes>
                  <Route
                    path="/"
                    element={
                      <>
                        <Spin
                          spinning={spinning}
                          indicator={<LoadingOutlined spin />}
                          size="large"
                        >
                          <Steps
                            current={current}
                            items={items}
                            onChange={(value) => {
                              setCurrent(value);
                            }}
                          />
                          <div style={contentStyle}>
                            {steps[current].content}
                          </div>
                          <div style={{ marginTop: 24 }}>
                            {current < steps.length - 1 && (
                              <Button
                                type="primary"
                                onClick={() => next()}
                                icon={<RightCircleFilled />}
                                ref={ref2}
                                style={{ marginRight: "8px" }}
                              >
                                {t("butNext")}
                              </Button>
                            )}
                            {current === steps.length - 1 && (
                              <>
                                <Button
                                  type="primary"
                                  icon={<DownloadOutlined />}
                                  style={{ marginBottom: "8px" }}
                                  onClick={() =>
                                    fs.saveAs(
                                      new Blob([JSON.stringify(data)], {
                                        type: "text/plain;charset=utf-8",
                                      }),
                                      "RWRSG-" + new Date().getTime() + ".json",
                                    )
                                  }
                                >
                                  {t("step.saveData")}
                                </Button>
                                <Button
                                  type="primary"
                                  style={{
                                    marginLeft: "8px",
                                    marginRight: "8px",
                                  }}
                                  icon={<DownloadOutlined />}
                                  onClick={() => {
                                    html2canvas(canvasRef.current, {
                                      /* Items whose PNG is not bundled come
                                       * from the data site, which serves
                                       * Access-Control-Allow-Origin: *. Without
                                       * this the canvas is tainted and
                                       * toBlob() throws. */
                                      useCORS: true,
                                    }).then(
                                      (canvas) => {
                                        canvas.toBlob((blob) => {
                                          if (blob) {
                                            /* Was a bare `saveAs`, which is
                                             * never imported — file-saver only
                                             * exports it as the default. The
                                             * ReferenceError left this button
                                             * silently doing nothing. */
                                            fs.saveAs(
                                              blob,
                                              "RWRSG-" +
                                                new Date().getTime() +
                                                ".png",
                                            );
                                          }
                                        });
                                      },
                                    );
                                  }}
                                >
                                  {t("step.saveImage")}
                                </Button>
                                <Button
                                  type="primary"
                                  style={{ marginRight: "8px" }}
                                  icon={<CopyOutlined />}
                                  onClick={() => {
                                    html2canvas(canvasRef.current, {
                                      /* Items whose PNG is not bundled come
                                       * from the data site, which serves
                                       * Access-Control-Allow-Origin: *. Without
                                       * this the canvas is tainted and
                                       * toBlob() throws. */
                                      useCORS: true,
                                    }).then(
                                      (canvas) => {
                                        canvas.toBlob((blob) => {
                                          if (blob) {
                                            try {
                                              const item = new ClipboardItem({
                                                "image/png": blob,
                                              });
                                              navigator.clipboard.write([item]);
                                              message.info(t("step.copied"));
                                            } catch (error) {
                                              message.error(
                                                t("step.copyFailed", {
                                                  msg: error.message || error,
                                                }),
                                              );
                                            }
                                          }
                                        });
                                      },
                                    );
                                  }}
                                >
                                  {t("butCopyImg")}
                                </Button>
                              </>
                            )}
                            {current > 0 && (
                              <Button
                                onClick={() => prev()}
                                icon={<LeftCircleOutlined />}
                              >
                                {t("butPrevious")}
                              </Button>
                            )}
                            {current == 0 && (
                              <>
                                <Upload {...props}>
                                  <Button
                                    ref={ref1}
                                    style={{ marginRight: "8px" }}
                                    icon={<UploadOutlined />}
                                  >
                                    {t("butImport")}
                                  </Button>
                                </Upload>
                              </>
                            )}
                          </div>
                        </Spin>
                      </>
                    }
                  />
                  <Route
                    path="/table"
                    element={
                      <>
                        <RwrTable />
                      </>
                    }
                  />
                  <Route path="/*" element={<NotFound />} />
                </Routes>
              </div>
            </Content>
            <Divider />
            <Typography style={{ width: "95%", padding: "20px" }}>
              {randomItem}
            </Typography>

            <Row justify="space-evenly">
              <Statistic.Timer
                type="countdown"
                title={t("countdown")}
                value={2064268800000}
                format="D day and H:m:s"
              />
              <Statistic.Timer
                type="countup"
                title={t("countup")}
                value={1755682690000}
                format="D day and H:m:s"
              />
            </Row>
            <Row justify="space-evenly">
              <Statistic
                value={siteUv}
                title={t("userCount")}
                formatter={formatter}
                prefix={<UserOutlined />}
              />
              <Statistic
                value={sitePv}
                title={t("siteCount")}
                formatter={formatter}
                prefix={<EyeOutlined />}
              />
              <Statistic
                value={pagePv}
                title={t("pageCount")}
                formatter={formatter}
                prefix={<FileTextOutlined />}
              />
            </Row>
            <a href={`https://github.com/${REPO}`}>
              <Row
                justify="space-evenly"
                style={{ margin: "20px 0", padding: "10px" }}
              >
                <img
                  src={`https://img.shields.io/github/contributors/${REPO}`}
                  alt="Contributors"
                />
                <img
                  src={`https://img.shields.io/github/commit-activity/t/${REPO}`}
                  alt="Commit activity"
                />
                <img
                  src={`https://img.shields.io/github/actions/workflow/status/${REPO}/.github%2Fworkflows%2Fghpage.yml`}
                  alt="Build status"
                />
                <img
                  src={`https://img.shields.io/github/last-commit/${REPO}`}
                  alt="Last commit"
                />
              </Row>
            </a>
            <div style={{ width: "100%", alignItems: "center" }}>
              {commitHistory ? (
                <Timeline
                  mode="alternate"
                  items={timelineItems}
                  style={{ width: "95%" }}
                />
              ) : (
                <div style={{ width: "100%", alignItems: "center" }}>
                  <Spin indicator={<GithubOutlined spin />} />
                </div>
              )}
            </div>
          </div>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
export default App;
