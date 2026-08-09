# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本仓库文档与提交历史以中文为主，回复和文档改动请沿用中文。仓库另有 `AGENTS.md`（代码风格、提交/PR 规范）与 `docs/architecture.md`（完整架构说明），本文件只记录高频命令与跨文件才能看出的架构约束。

## 命令

```bash
npm run build    # 由 src/ + index.template.html 重新生成 index.html
npm run dev      # 先 build，再在 http://127.0.0.1:4173 启动静态服务
npm test         # 先 build，再运行 node --test（全部 tests/*.test.mjs）
npm run package  # 先 build，再在 dist/ 生成发布 zip 与 sha256
```

跑单个测试文件（注意：测试读取的是构建产物 `index.html`，改了 `src/` 必须先 `npm run build`）：

```bash
node --test tests/csv-worker-core.test.mjs
```

按测试名过滤：

```bash
node --test --test-name-pattern "build script composes" tests/html-contract.test.mjs
```

PowerShell 若拦截 `npm.ps1`，改用 `npm.cmd run build` / `npm.cmd test`。零依赖项目，不需要 `npm install`。

## 构建模型（最重要的约束）

- `index.html` 是**生成物**，也是唯一的分发物。永远改 `src/`，然后 `npm run build`；直接编辑 `index.html` 会在下次构建时被覆盖。
- 改完源码后必须提交重新生成的 `index.html`：CI 会跑 `git diff --exit-code -- index.html`，产物与源码不一致直接失败。
- `scripts/build-single-html.mjs` 不是 bundler，只是**按固定顺序做文本内联**。`src/app/*.js`、`src/shared/*.js`、`src/workers/*.js` 不是 ES module，没有 import/export，全部拼进同一个脚本作用域。
  - 新增源码文件必须同时加进构建脚本的 `sources` 列表，并更新 `tests/html-contract.test.mjs` 里的构建顺序契约测试。
  - `src/app/*` 的拼接顺序是依赖顺序（state → file-io → filtering → profile → table → editing → columns → import → export → main）。声明留在归属文件里，`main.js` 之前不要引入顶层副作用；启动逻辑放 `main.js` 末尾。
  - `src/shared/*.js` 会被前置进主线程脚本**和**多个 Worker 脚本，因此必须是纯函数：不碰 DOM、不用模块语法、无副作用。
- 构建期会做两件安全相关的事，改动时不要绕开：校验 `vendor/xlsx.full.min.js` 的 SHA-256（与脚本里的 `SHEETJS_SHA256` 常量比对），以及按内联脚本内容算出 CSP 的 `script-src 'sha256-...'` 写进产物。产物 CSP 含 `connect-src 'none'`，运行时不允许任何外连。

## 运行时结构

主线程 + 4 个 Blob Worker。Worker 源码以 `<script type="text/plain">` 内嵌在 `index.html`（id 为 `csv-worker-source` / `query-worker-source` / `large-data-worker-source` / `excel-worker-source`），运行时由 `createInlineWorker(scriptId)` 转成 Blob Worker。

| Worker | 职责 |
| --- | --- |
| csv-worker | CSV 分隔符探测、状态机解析、JSONL 展开、UTF-8/GB18030 解码、解析问题检测 |
| query-worker | 持有 row chunks，负责搜索、列筛选、重复值筛选、排序、row window 切片、异步唯一值统计 |
| large-data-worker | ≥24 MiB 的 CSV/TSV/TXT/JSONL：流式扫描原始 `File` 建立字节偏移索引，按需 `File.slice()` 取 cell/row |
| excel-worker | 内联了校验过的 SheetJS，负责 workbook 解析、sheet 切换、XLSX 导出；主线程从不持有 workbook |

数据流核心不变量：

- 任何数据载入路径最终都要产出标准 dataset 形状（`headers` / `rows` / `issues` / `cellMeta` / `file`）并交给 `setDataset(result)`，不要在 import 代码里手工赋值 `state.headers`、`state.rows` 或文件统计。
- `state.rows` 是 chunked 数组门面（内部是 `state.rowChunks`）。用 `state.rows[i]`、`for...of`、`forEach`；大数据集上避免 `toArray()`。行/列结构变化后调用 `seedQueryWorker()` 重新播种 Worker。
- 视图重算的唯一入口是 `recomputeView()`：构造可序列化请求 → 走 query Worker → Worker 未就绪时回退 `computeViewSync(request)`。
- 渲染是虚拟化的：滚动类变化用 `renderRowsOnly()`，影响表头/列/排序指示的用 `renderGrid()`；不要往 `renderRows()` 里加解析或全表级工作。
- 缓存失效是正确性的一部分（`columnValueCache`、`cellRenderCache`、`cellVersions`、`rowPositionMap`、query Worker chunks、`issues`）。新增 mutation 时逐项确认，对照 `docs/architecture.md` 的 "Cache And Invalidation Rules" 与几条 mutation recipe。
- 任何可能在更新的载入/查询之后才返回的异步操作都必须带 token：`loadToken`（文件与 sheet 载入）、`queryToken`（查询响应）、`columnValueTokens`（按列唯一值）、`queryRowsVersion`（数据集版本）。

大文件模式的边界：原始 `File` 是页面生命周期内的唯一字节来源，不复制到 OPFS，因此刷新后无法恢复；主线程只常驻 500 字符预览与按字节数上限的缓存；超过 `LARGE_EXPENSIVE_OPERATION_MAX_BYTES`（128 MiB）会关闭整列排序、重复值统计、列画像和 XLSX 导出。这些阈值集中在 `src/app/state.js` 顶部的常量区。

## 测试约定

- Node 内置 runner + `assert/strict`，文件名 `*.test.mjs` 放 `tests/`。
- Worker 测试用 `vm.runInContext` 加载源码：`csv-worker-core` / `large-data-worker` 从 `index.html` 抽取内嵌 Worker 源码并依赖 `self.__CSV_CORE__` 之类的测试导出；`shared-core` 直接跑 `src/shared/*.js`。给 Worker 加可测核心时沿用这个导出模式。
- `tests/html-contract.test.mjs` 是契约测试：必需的 DOM id、函数钩子、构建顺序、CI 与发布脚本内容、SheetJS 校验和、版本一致性。新增 DOM id 或关键函数时同步更新它。
- 版本号硬编码在该契约测试里（`app package version is 2.3.9`）。升版本要同时改 `package.json`、`sbom.cdx.json` 的 `metadata.component.version`、这条测试、`README.md`/`CHANGELOG.md`/`SECURITY.md`；tag `v*` 与 `package.json` 版本不一致会让 release job 失败。

## 隐私与依赖红线

- 文件处理全程在浏览器本地。未经明确讨论不要引入服务端上传、远程处理或任何运行时外连（会同时违反 CSP）。
- 恢复草稿只存改动过的 cell 坐标与值到 sessionStorage/IndexedDB，不存完整源文件；不要扩展成整文件持久化。
- SheetJS 是固化的本地构建输入。升级时必须同步更新 `vendor/` 文件、`SHEETJS_SHA256`、`sbom.cdx.json`、`THIRD_PARTY_NOTICES.md` 和 Excel Worker 运行时测试。
