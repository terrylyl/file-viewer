# 本地表格文件查看器

一个本地运行的轻量表格文件查看器，面向 CSV、TSV、TXT、JSONL 和 Excel 文件的查看、检索、编辑、复制与导出。文件在浏览器本地处理，CSV/JSONL 解析走 Web Worker，不会上传到服务器。

当前版本：`0.2.0`

## 项目结构

```text
file-viewer/
├─ index.template.html           # 单页模板，包含构建占位符
├─ index.html                    # 构建产物，最终单文件分发物
├─ package.json                  # 本地运行与测试脚本
├─ scripts/
│  ├─ build-single-html.mjs      # 将 src/ 内联生成 index.html
│  └─ serve.mjs                  # 零依赖静态服务器
├─ src/
│  ├─ app/main.js                # 主线程应用逻辑
│  ├─ shared/*.js                # 主线程和 Worker 共用的纯逻辑
│  ├─ styles.css                 # 应用样式
│  └─ workers/*.js               # CSV/JSONL、查询、Excel Worker
├─ tests/
│  ├─ csv-worker-core.test.mjs   # CSV/JSONL Worker 核心行为测试
│  ├─ query-worker-filter.test.mjs # 查询筛选核心测试
│  ├─ shared-core.test.mjs       # 共享纯函数测试
│  └─ html-contract.test.mjs     # 页面结构与关键交互契约测试
├─ docs/                         # 设计文档和实现计划
└─ README.md
```

## 运行

```bash
npm run dev
```

PowerShell 如果拦截 `npm.ps1`，可以改用：

```powershell
npm.cmd run dev
```

也可以直接运行：

```bash
node scripts/serve.mjs
```

默认地址：

```text
http://127.0.0.1:4173
```

## 测试

```bash
npm test
```

或：

```bash
node --test
```

## 数据隐私

- 文件读取、解析、筛选、编辑和导出都在浏览器本地完成。
- CSV/JSONL 解析和大表查询优先在浏览器 Web Worker 中执行。
- 使用 GitHub Pages 或本地服务器访问时，文件内容不会上传到云端。
- Excel 支持会尝试加载 SheetJS。如果本地没有 `vendor/xlsx.full.min.js`，会从 CDN 加载库文件；这是加载解析库，不会上传用户文件。

## 支持格式

- CSV、TSV、TXT：自动识别逗号、Tab、分号、竖线分隔符。
- JSONL：按 JSON Lines 解析，每行必须是 JSON object；字段自动展开为列。
- XLSX、XLS：通过 SheetJS 读取 workbook 和 sheet。
- 剪贴板表格：未载入文件时可直接从剪贴板导入表格内容，支持有表头和无表头两种情况。

## 已实现功能

### 文件读取与解析

- 拖拽或选择本地文件读取。
- 支持 CSV/TSV/TXT/JSONL/XLSX/XLS。
- CSV 支持引号字段、字段内逗号、字段内换行、双引号转义。
- CSV 解析修复过大行数下的 `too many function arguments` 问题。
- 对部分未转义公式内容做容错，减少本应属于同一 cell 的内容被错误拆列。
- 自动 UTF-8 解码，UTF-8 失败后尝试 GB18030/GBK。
- 解析过程显示进度；CSV/JSONL 使用 Worker，避免解析阶段锁死页面。
- 检测重复列名、列数不一致、空字段比例高和超长字段，并在界面中提示。

### 表格浏览与筛选

- 虚拟滚动表格、固定表头、行号、横向滚动。
- 列宽拖拽、列隐藏/显示、表头拖拽调整列顺序。
- 列数较少时保持自然列宽，不强制拉伸到全宽。
- Header 类 Excel 筛选菜单：升序/降序、搜索本列值、按值勾选过滤、清除本列筛选。
- 顶部列名总览固定展示全部列，筛选中的列会以提示色标记。
- 点击顶部列名或表头菜单中的“列画像”，可查看类型、空值、唯一值、重复值、数值/日期范围、文本特征和常见值。
- 列画像在查询 Worker 中计算并缓存；空值、重复值、常见值和类型异常可一键转成列筛选。
- 全表搜索、按列搜索、大小写敏感、只显示命中行、命中高亮。
- 一键清除筛选：同时清空列筛选、搜索、只看命中和排序。
- 支持隐藏当前筛选结果行，也支持恢复隐藏行。
- 筛选后显示当前可见行数统计。

### 选择、复制与键盘操作

- 支持方向键移动当前单元格。
- 支持拖拽框选单元格。
- 支持全选、单/多选行、单/多选列。
- 复制选区按钮会复制当前选区。
- 支持 `Ctrl/Cmd + C` 复制选区。
- 复制时同时写入 `text/html` 和 `text/plain`，尽量保证粘贴到 Excel 或在线表格后不串行。
- 选中 header 时复制结果包含 header；未选中 header 时不包含 header。
- 右键菜单：复制单元格、复制整行、复制列名、查看完整内容。

### 列管理

- 支持任意列重命名，包括原始文件列名。
- 支持单列恢复原始列名。
- 支持新增自定义列：空列、序列号列、复制已有列。
- 自定义列可通过表头菜单删除。
- 支持向自定义列粘贴外部表格数据。
- 支持拼接列：按顺序选择多列、设置别名，生成单列并追加到最右侧。
- 拼接列输出保留 Markdown 三反引号代码块格式：

````markdown
# 别名
```markdown
被拼接列对应的内容
```
````

- 拼接方案会保存在本地，下次载入新数据后可在拼接弹窗中复用。

### 单元格详情、编辑与高亮

- 点击单元格在右侧查看详情。
- 详情区显示行号、列号、列名、字符数、行数等信息。
- 支持在右侧详情区编辑单元格内容。
- 编辑后自动高亮该 cell。
- 顶部显示已编辑 cell 数量。
- 支持撤回编辑和恢复撤回，快捷键支持 `Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`。
- 如果撤回后内容恢复原始值，编辑高亮会自动消失。
- 支持用户手动高亮感兴趣的 cell，颜色限定为黄色、蓝色、粉色。
- 编辑高亮和手动高亮使用不同视觉样式，避免冲突。

### 放大查看与格式解析

- 双击 cell 或点击详情区“放大”打开完整内容弹窗。
- 放大弹窗支持左右两列布局：左侧原文，右侧解析结果。
- 左右区域默认各占 50%，可拖拽中间分隔条调整宽度。
- 弹窗右下角可拖拽调整整体大小；再次打开会恢复默认大小。
- 支持格式选择：自动、Markdown、JSON、HTML、代码、纯文本。
- 自动识别 JSON、HTML、Markdown、代码和普通文本。
- JSON 解析结果以树状结构展示。
- JSON 字符串字段如果看起来像 Markdown，会显示“解析 Markdown”按钮，点击后在该字段下方渲染 Markdown，可再次收起。
- HTML 预览使用 sandbox iframe，并清理 script、事件属性和外部资源属性。
- 放大弹窗支持搜索、复制全文、字符数、命中数、等宽字体和分块加载。

### 导出

- 导出当前筛选后的可见列。
- 默认导出 CSV，可选择 XLSX。
- 可设置拆分后的文件数量，例如 500 行拆成 5 个文件，每个文件复用相同 header，并自动追加 `_part1`、`_part2` 后缀。
- 支持 File System Access API 的浏览器会弹出保存对话框并尽量沿用打开文件的位置；不支持时降级为浏览器默认下载。
- 当前筛选结果为空时会提示，不生成空文件。

### Excel 支持

- XLSX/XLS 通过 SheetJS 读取。
- 支持 workbook 内多个 sheet，通过顶部 Sheet 下拉框切换。
- Excel 导入默认使用性能优先的安全模式，不读取 SheetJS 富文本 HTML 和完整样式，避免 `sharedStrings.xml` 或超长字符串导致浏览器内存峰值过高。
- 解析前会检查 XLSX 压缩目录中 `xl/sharedStrings.xml` 的解压后大小；超过安全阈值时会提前报错，不进入 SheetJS 解析。
- 对明显过大的 XLSX 文件会提示错误，同时尝试提供“选择 Sheet 并转换为 CSV”的备用入口；转换过程不载入 SheetJS workbook。
- XLSX 转 CSV 备用入口只处理常见 `.xlsx` 压缩结构，暂不支持 `.xls`、加密文件、Zip64 和特殊压缩方式。
- 单元格样式展示是 best-effort；当前版本优先保证大文件读取稳定性。

## SheetJS 离线支持

Excel 的 XLSX/XLS 结构是压缩包加 XML 或二进制工作簿，项目采用 SheetJS 作为可选第三方库：

1. 优先加载 `vendor/xlsx.full.min.js`
2. 本地文件不存在时再尝试 CDN：`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`

如果需要完全离线 Excel 支持，把 SheetJS 浏览器版文件放到：

```text
vendor/xlsx.full.min.js
```

CSV、TSV、TXT 和 JSONL 功能不依赖任何第三方库。

## 设计取舍

- 当前 `file-viewer` 仍是单页本地工具，核心数据保留在浏览器内存中，DOM 只渲染可视区域。
- CSV/JSONL 解析已经 Worker 化，但筛选、搜索和编辑仍基于内存中的完整数据集。
- 单个超长 cell 不进入表格 DOM 全量渲染，只在详情面板和放大弹窗中按块显示。
- Excel 解析优先在 Worker 中执行，Worker 无法加载 SheetJS 时才回退到主线程；对超大 `sharedStrings.xml`、大量长文本或超大压缩包会触发安全保护，避免浏览器直接崩溃。
- 大型 Excel 的完整支持需要迁移到流式读取和 Worker 架构。
- 大文件架构优化会在独立子项目 `file-viewer-stream` 中推进，方向包括流式解析、分块存储、Worker 筛选和分页索引。

## 后续可扩展

- 流式解析 CSV/JSONL，避免一次性把完整文件读入内存。
- 分块存储和分页索引，降低超大文件的内存压力。
- 将更多筛选索引、去重统计和导出路径迁移到更低内存的分块模型。
- 内置或锁定 SheetJS vendor 包，减少 CDN fallback 依赖。
- 增加列类型推断、数值过滤、正则搜索。
- 保存列宽、隐藏列、弹窗尺寸和搜索偏好到 localStorage。
