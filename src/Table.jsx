import { useState, useMemo } from "react";
import {
  Table,
  Input,
  Row,
  Col,
  Card,
  Descriptions,
  Button,
  Modal,
  InputNumber,
  message,
  Flex,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  SwapOutlined,
  PlusOutlined,
  CopyOutlined,
  DownloadOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import KeyListTrans from "../pre-pull/keyListTrans.json";
import priceData from "./price.json";
import useLocalStorageState from "use-local-storage-state";
import html2canvas from "html2canvas";
import fs from "file-saver";
import { useTranslation } from "react-i18next";
import { useCatalog } from "./catalog.js";
import { wikiUrl } from "./onlineSource.js";
import { inventoryRowFor, upsertInventoryRows } from "./inventory.js";
import { matches } from "./search.js";

// 转换数据格式：将data.json的字典结构转换为数组
const convertDataToArray = (data) => {
  return Object.entries(data).map(([id, weapon]) => {
    const converted = {
      id: id, // 保存外层键（如 "ar15"）
      enName: weapon.en_name,
      cnName: weapon.cn_name,
      key: weapon.key, // 内部的key字段（如 "ar15.weapon"）
      hud_icon: weapon.hud_icon,
      ...weapon.spec,
    };
    return converted;
  });
};

const RwrTable = () => {
  const { t } = useTranslation();

  /* Bundled snapshot first, online additions second — see catalog.js. The list
   * is built here rather than at module scope so it can pick up the online
   * layer once it answers. */
  const catalog = useCatalog();
  const WeaponList = useMemo(
    () => convertDataToArray(catalog.entries),
    [catalog.entries],
  );

  // 使用localStorage存储表格设置
  const [tableSettings, setTableSettings] = useLocalStorageState(
    "weaponTableSettings",
    {
      defaultValue: {
        pageSize: 10,
        searchText: "",
        sortColumn: "cnName",
        sortDirection: "ascend",
      },
    },
  );

  // 状态管理
  const [searchText, setSearchText] = useState(tableSettings.searchText);
  const [selectedWeapon, setSelectedWeapon] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editPrice, setEditPrice] = useState(null);
  const [editNum, setEditNum] = useState(null);

  // 处理搜索
  const handleSearch = (value) => {
    setSearchText(value);
    setTableSettings({ ...tableSettings, searchText: value });
  };

  /* This list is the *catalog*, not the stall, so a record carries no price and
   * no quantity. Both have to come from the stall row — prefilling `1` for an
   * item already held 5 silently reset its quantity on save.
   *
   * `??` rather than `||`: a price of 0 is a real price, not a missing one. */
  const handleOpenEdit = (record) => {
    const held = inventoryRowFor(record.id);
    setEditRecord(record);
    setEditPrice(held?.price ?? record.price ?? priceData[record.hud_icon] ?? null);
    setEditNum(held?.num ?? 1);
    setEditModalVisible(true);
  };

  /* Writes the same row shape the picker does: `key` is the hud icon the stall
   * renders, `itemKey` is the record key that identifies it.
   *
   * Without `itemKey` the row's identity fell back to the icon, which 507 of
   * the 948 records share — so adding an item already in the stall appended a
   * duplicate rather than editing it, and the edit itself was then dropped by
   * de-duplication. `upsertInventoryRows` replaces in place. */
  const handleSaveEdit = () => {
    if (!editRecord) return;
    upsertInventoryRows([
      {
        key: editRecord.hud_icon,
        itemKey: editRecord.id,
        name: editRecord.cnName || editRecord.enName || editRecord.id,
        price: editPrice,
        num: editNum,
      },
    ]);
    setEditModalVisible(false);
    setEditRecord(null);
  };

  // 处理排序变化
  const handleSortChange = (pagination, filters, sorter) => {
    const newSettings = {
      ...tableSettings,
      sortColumn: sorter.field,
      sortDirection: sorter.order,
    };
    setTableSettings(newSettings);
  };

  // 过滤道具数据
  const filteredWeapons = useMemo(() => {
    let result = [...WeaponList];

    // 应用搜索过滤 —— 与选择器共用同一套规则（见 src/search.js）
    if (searchText) {
      result = result.filter((weapon) =>
        matches([weapon.cnName, weapon.enName, weapon.id], searchText),
      );
    }

    // 应用排序
    const { sortColumn, sortDirection } = tableSettings;
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // 尝试转换为数字比较
        const numA = parseFloat(aValue);
        const numB = parseFloat(bValue);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === "ascend" ? numA - numB : numB - numA;
        }

        // 字符串比较
        const strA = String(aValue || "").toLowerCase();
        const strB = String(bValue || "").toLowerCase();

        return sortDirection === "ascend"
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      });
    }

    return result;
  }, [searchText, tableSettings, WeaponList]);

  // 构建表格列
  const columns = useMemo(() => {
    return [
      {
        title: t("workbench.image"),
        key: "image",
        fixed: "left",
        width: 80,
        render: (_, record) => (
          <img
            src={catalog.iconUrl(record.hud_icon)}
            style={{
              maxHeight: "50px",
              maxWidth: "50px",
              objectFit: "contain",
            }}
          />
        ),
      },
      {
        title: t("workbench.cnName"),
        dataIndex: "cnName",
        key: "cnName",
        // fixed: "left",
        width: 20,
        sorter: true,
        sortOrder:
          tableSettings.sortColumn === "cnName"
            ? tableSettings.sortDirection
            : null,
        render: (cnName, record) => (
          <Button
            type="link"
            onClick={() => setSelectedWeapon(record)}
            style={{ padding: 0, height: "auto" }}
          >
            {/* An online-only entry has no bundled translation yet; the English
             * name beats an empty cell. */}
            {cnName || <span style={{ opacity: 0.65 }}>{record.enName}</span>}
          </Button>
        ),
      },
      {
        title: t("key"),
        dataIndex: "id",
        key: "id",
        width: 200,
        sorter: true,
        sortOrder:
          tableSettings.sortColumn === "id"
            ? tableSettings.sortDirection
            : null,
      },
      {
        title: t("action"),
        key: "action",
        width: 150,
        render: (_, record) => (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            {t("workbench.addEdit")}
          </Button>
        ),
      },
    ];
  }, [tableSettings.sortColumn, tableSettings.sortDirection, catalog, t]);

  // 道具详情面板
  const weaponDetailPanel = selectedWeapon && (
    <div id="target_section">
      <Card
        title={
          selectedWeapon.cnName ||
          selectedWeapon.enName ||
          t("workbench.unknownItem")
        }
        extra={
          <Flex gap={4} align="center">
            {/* The same record, rendered as a full article on the wiki. */}
            {wikiUrl(selectedWeapon.key, catalog.online.packageId) && (
              <Tooltip title={t("workbench.viewOnWiki")}>
                <Button
                  type="text"
                  icon={<LinkOutlined />}
                  href={wikiUrl(selectedWeapon.key, catalog.online.packageId)}
                  target="_blank"
                  rel="noreferrer"
                />
              </Tooltip>
            )}
            <Button
              type="text"
              icon={<SwapOutlined />}
              onClick={() => setSelectedWeapon(null)}
            />
          </Flex>
        }
        style={{ marginTop: 20 }}
      >
        {/* 道具图标和名称 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 16,
            justifyContent: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: "bold", fontSize: "18px" }}>
              {selectedWeapon.cnName}
            </div>
            <div style={{ color: "#666", fontSize: "14px" }}>
              {selectedWeapon.enName}
            </div>
          </div>
          <div
            style={{
              width: 150,
              height: 150,
              overflow: "hidden",
              marginLeft: 20,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img
              src={catalog.iconUrl(selectedWeapon.hud_icon)}
              alt={selectedWeapon.cnName || selectedWeapon.enName}
              style={{
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>
        </div>

        {/* 属性列表 */}
        <Descriptions
          column={{ xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
          size="small"
        >
          {Object.entries(selectedWeapon).map(([key, value]) => {
            // 特殊处理姿态属性
            if (
              key === "stance" &&
              typeof value === "object" &&
              value !== null
            ) {
              return (
                <Descriptions.Item
                  key={key}
                  label={KeyListTrans[key] || key}
                  labelStyle={{ fontWeight: "bold", width: "30%" }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {Object.entries(value).map(([stanceKey, stanceValue]) => (
                      <div key={stanceKey}>
                        {t(`stance.${stanceKey}`, stanceKey)}:{" "}
                        {stanceValue}
                      </div>
                    ))}
                  </div>
                </Descriptions.Item>
              );
            }

            // 普通属性直接显示
            return (
              <Descriptions.Item
                key={key}
                label={KeyListTrans[key] || key}
                labelStyle={{ fontWeight: "bold", width: "30%" }}
              >
                {typeof value === "object" ? JSON.stringify(value) : value}
              </Descriptions.Item>
            );
          })}
        </Descriptions>
      </Card>
    </div>
  );

  const detailCardId = "target_section";

  // 保存图片
  const handleSaveImage = async () => {
    if (!selectedWeapon) return;
    const detailCard = document.getElementById(detailCardId);
    if (!detailCard) return;

    try {
      const canvas = await html2canvas(detailCard, {
        useCORS: true,
        backgroundColor: null,
        scale: 5,
      });
      canvas.toBlob((blob) => {
        if (blob) {
          fs.saveAs(blob, `${selectedWeapon.cnName}-${selectedWeapon.id}.png`);
        }
      });
    } catch (error) {
      message.error(t("workbench.saveImageFailed", { msg: error.message }));
    }
  };

  // 复制图片
  const handleCopyImage = async () => {
    if (!selectedWeapon) return;
    const detailCard = document.getElementById(detailCardId);
    if (!detailCard) return;

    try {
      const canvas = await html2canvas(detailCard, {
        useCORS: true,
        backgroundColor: null,
        scale: 2,
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            const item = new ClipboardItem({
              "image/png": blob,
            });
            await navigator.clipboard.write([item]);
            message.info(t("workbench.copiedToClipboard"));
          } catch (error) {
            message.error(t("workbench.copyFailed", { msg: error.message }));
          }
        }
      });
    } catch (error) {
      message.error(t("workbench.copyImageFailed", { msg: error.message }));
    }
  };

  return (
    <div style={{ padding: 20, position: "relative" }}>
      {/* 编辑对话框 */}
      <Modal
        title={t("workbench.addEditItem")}
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalVisible(false)}
        width={400}
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label={t("workbench.itemName")}>
            {editRecord?.cnName}
          </Descriptions.Item>
          <Descriptions.Item label={t("workbench.itemKey")}>{editRecord?.id}</Descriptions.Item>
          <Descriptions.Item label={`${t("price")} (rp)`}>
            <InputNumber
              style={{ width: "100%" }}
              value={editPrice}
              onChange={setEditPrice}
              min={0}
              placeholder={
                priceData[editRecord?.hud_icon] || t("workbench.inputPrice")
              }
            />
          </Descriptions.Item>
          <Descriptions.Item label={t("num")}>
            <InputNumber
              style={{ width: "100%" }}
              value={editNum}
              onChange={setEditNum}
              min={1}
            />
          </Descriptions.Item>
        </Descriptions>
      </Modal>

      {/* 顶部控制栏 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Input
            placeholder={t("workbench.searchPlaceholder")}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            allowClear
            style={{ width: "100%" }}
          />
        </Col>
      </Row>

      {/* 道具表格 */}
      <Table
        dataSource={filteredWeapons}
        columns={columns}
        rowKey="id"
        size="small"
        bordered
        scroll={{ x: "max-content", y: "calc(100vh - 220px)" }}
        pagination={{
          pageSize: tableSettings.pageSize,
          showSizeChanger: false,
          showTotal: (total) => t("workbench.totalItems", { num: total }),
        }}
        onChange={handleSortChange}
      />

      {/* 道具详情面板 */}
      {weaponDetailPanel}
      {/* 保存图片和复制图片按钮 */}
      {selectedWeapon && (
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleSaveImage}
          >
            {t("workbench.saveImage")}
          </Button>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={handleCopyImage}
          >
            {t("butCopyImg")}
          </Button>
        </div>
      )}
    </div>
  );
};

export default RwrTable;
