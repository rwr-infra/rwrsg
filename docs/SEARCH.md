# 搜索规则与跨语言统一

## 1. 先说结论：共用的不是代码，是数据

「本地的用 Python，在线的用 JS，怎么统一」——**不要去两边各写一份算法**。
两份代码一定会漂移，而且漂移的那天没人会发现。

真正需要共用的只有两样东西：

| 共用什么 | 文件 | 谁读 |
| --- | --- | --- |
| **规则表**（哪些字符要折叠成什么） | `shared/search-rules.json` | JS、Python 都读 |
| **契约用例**（一组输入 → 期望结果） | `shared/search-cases.json` | JS 测试读；Python 也要读同一份 |

算法本身很短（下面 10 行），短到不值得跨语言共享代码 —— 但**映射表**一旦分叉，
`3` 能搜到 `Ⅲ型防弹背心` 而 Python 那边搜不到，这种 bug 极难发现。所以把表抽成数据。

```js
// src/search.js 的核心，Python 版照着写就行
normalize(text) =
  text.replace(CJK 数字 → 阿拉伯数字)   // Ⅲ → 3
      .replace(全角 → 半角)             // （ → (
      .toLowerCase()
      .replace(ASCII 罗马数字 → 数字)   // III → 3
      .replace(/\s+/g, "")              // 去掉所有空白
```

## 2. 谁负责搜

- **浏览器（JS）是唯一的运行时搜索方。** 在线数据源只能拿到原始名称，
  没有预处理过的字段，所以 JS 必须在运行时归一化 —— 这一点决定了 JS 是主实现。
- **构建管线（Python，`pre-pull/`）目前不搜索**，只负责产出数据。
  它不需要这个算法；需要的时候（CLI、机器人、服务端筛选）再按下面的方式接进来。

## 3. Python 要接的时候怎么做

```python
import json, re, pathlib

RULES = json.loads(pathlib.Path("shared/search-rules.json").read_text(encoding="utf-8"))
CASES = json.loads(pathlib.Path("shared/search-cases.json").read_text(encoding="utf-8"))

def normalize(text: str) -> str:
    s = str(text)
    # 中文数字先折：Python 的 str.lower() 也会把 Ⅲ(U+2162) 变成 ⅲ(U+2172)，
    # 是另一个字符。表里两种大小写都列了，所以顺序不影响结果。
    s = re.sub("[" + "".join(RULES["cjkNumerals"]) + "]", lambda m: RULES["cjkNumerals"][m.group()], s)
    s = re.sub(r"[\uFF01-\uFF5E]", lambda m: chr(ord(m.group()) - 0xFEE0), s)
    s = s.lower()
    s = re.sub(r"\b(?:" + "|".join(sorted(RULES["asciiNumerals"], key=len, reverse=True)) + r")\b",
               lambda m: RULES["asciiNumerals"][m.group()], s)
    return re.sub(r"\s+", "", s)

def matches(fields, query: str) -> bool:
    q = normalize(query)
    return True if not q else any(q in normalize(f) for f in fields)
```

自检（放进 `pre-pull/` 的任意脚本或 CI）：

```python
for c in CASES["cases"]:
    got = matches(c["fields"], c["query"])
    assert got == c["expect"], f'{c["query"]!r} 期望 {c["expect"]} 实际 {got} —— {c["why"]}'
```

两边跑同一份 `search-cases.json`，"我们是一致的" 就从假设变成被检查的事实。

## 4. 为什么表里两种大小写都列

`Ⅲ` 是 U+2162，`ⅲ` 是 U+2172，**是两个不同的字符**。
JavaScript 的 `toLowerCase()` 和 Python 的 `str.lower()` **都会**把前者变成后者。

只列大写那一份时，如果先 `lower()` 再折数字，就再也匹配不上了 ——
开发时踩过一次，表现为「`Ⅲ型防弹背心` 搜 `3` 搜不到」。
表里同时列出 `Ⅰ…Ⅹ` 和 `ⅰ…ⅹ`，折叠顺序就无关紧要了，两种语言都不会踩。

## 5. 现在的规则清单

| 规则 | 为什么需要（都在数据里实际存在） |
| --- | --- |
| 中文罗马数字 → 数字 | `Ⅲ型防弹背心` = "Vest, type III"，输入 `3` 必须能找到 |
| ASCII 罗马数字 → 数字（仅多字母） | `Vest, type III`，输入 `3` 也要能找到。单个 `i`/`v`/`x` 不折 —— 它们更可能是真词 |
| 全角 → 半角 | 124 个名称用 `（）`，如 `鲁格 AC556（刺刀）` |
| 去空白 | `鲁格 AC556` 输入 `鲁格AC556` 要能找到 |
| 大小写折叠 | 英文名大小写混排 |

**没有**做的：模糊匹配、拼音、编辑距离。这些会让 `ak47` 匹配到无关的东西，
而当前的数据规模（约 1100 条）根本不需要。

## 6. 相关文件

| 文件 | 职责 |
| --- | --- |
| `shared/search-rules.json` | 规则表（唯一真相） |
| `shared/search-cases.json` | 契约用例（唯一真相） |
| `src/search.js` | JS 实现，读规则表 |
| `src/search.test.js` | 跑契约用例 |
| `src/ItemPicker.jsx` | 选择器调用 `matches` |
| `src/Table.jsx` | 数据工作台调用同一个 `matches` |
