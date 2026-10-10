# RWRSG · RWR 摆摊生成器

给 Running with Rifles 玩家用的**摆摊海报生成器**：挑物品、设价格/库存、调样式，导出一张可以直接发群里的图片。

线上地址：<https://rwrsg.079682.xyz>（GitHub Pages，`main` 推送即部署）

---

## 开发

```bash
npm ci
npm run dev            # 本地开发
npm run check          # 提交前跑这个：lint + 测试 + 构建
```

`npm run check` 是唯一的门禁，CI 跑的也是它。本地过了线上基本就过。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run lint` | ESLint |
| `npm test` | `node --test`，无测试框架、无额外依赖 |
| `npm run i18n` | 校验两个语言包键集一致、且代码里每个 `t("…")` 都有对应键 |
| `npm run build` | 产物输出到 `dist/` |
| `npm run check` | 上面几个串起来 |

---

## 几条硬规矩

1. **存档数据必须向后兼容。** 用户在 `localStorage` 的 `data` 键和导出的 JSON 里
   存着东西，任何时候都不能让旧存档打不开、丢字段或改变含义。
2. **物品身份用 `itemKey`（记录键），不是 `key`（hud 图标）。** 948 条记录只有
   510 个图标，拿图标当身份会让「共用一张图的不同物品」互相串台。
3. **只有图标可用时，取「图标点名的那个记录」**（`vest3` → `vest3.carry_item`），
   不是「第一个用这个图标的记录」。`vest3` 这一个图标被 35 条记录共用。
4. **同一把武器的多种配置、同一条降解链的多个状态，是一样东西。** 列表里只出现一次。
5. **内置数据永远优先于在线数据。** 在线源只做补充：补图标、补新物品。
6. **搜索只有一份实现。** 规则表放在 `shared/`，JS 和 Python 读同一份文件，
   用同一份用例检查一致性 —— 不要两边各写一遍。
7. **界面文案一律走 `t()`，不许在 JSX 里写死中文。** 拼句子也不行 ——
   跨语言的语序不一样，`t("a") + x + t("b")` 必然在某种语言里读不通。

细节见 **[docs/ITEM-GROUPING.md](docs/ITEM-GROUPING.md)**（物品识别与聚合）
和 **[docs/SEARCH.md](docs/SEARCH.md)**（搜索规则与跨语言统一）。

---

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/App.jsx` | 主页：摆摊三步（售卖物 / 属性 / 保存） |
| `src/Table.jsx` | 数据工作台：搜索、看完整属性、加进摊子 |
| `src/ItemPicker.jsx` | 物品选择器：可视化网格 + 搜索 + 分包/分类筛选 + 聚合 |
| `src/PromoBanner.jsx` | 顶部推广条，指向 rwrops 数据百科 |
| `src/inventory.js` | 存档行的身份、兼容解析与读写 |
| `src/itemKey.js` | 记录键的解析（`<key>.<type>`、hud 图标路径）—— 纯函数 |
| `src/itemGroups.js` | 聚合规则（武器配置 / 降解链） |
| `src/catalog.js` | 内置数据与在线数据的合并 |
| `src/search.js` | 搜索（选择器与工作台共用），规则表在 `shared/` |
| `src/format.js` | 导出图片里的数字格式（`1234` → `1.234k`）—— 纯函数 |
| `src/onlineSource.js` | 在线数据源 [rwr-static.079682.xyz](https://rwr-static.079682.xyz) |
| `shared/` | 跨语言共用：搜索规则表 + 契约用例 |
| `scripts/check-i18n.mjs` | 语言包与 `t()` 用键的校验 |
| `src/data.json` | 内置物品快照（中文名 + 属性），由 `pre-pull/` 产出 |
| `src/assets/items/` | 内置物品图标 |
| `pre-pull/` | 从游戏文件抽数据的脚本与中间产物 |

`src/*.test.js` 与被测模块放在一起；`npm test` 直接跑它们。

---

## 数据来源

- **内置快照**：`src/data.json` + `src/assets/items/*.png`。权威、离线可用。
- **在线数据源**：隔壁 [rwrops](https://rwrops.b.rwr-infra.uk/) 的数据站。
  默认开启，只补内置没有的东西；关掉或连不上时，行为和以前完全一样。
  价格**不**取自在线源 —— 游戏内部价（`inventory_price`）和群价不是一回事。
