# 本地表格文件查看器

一个本地运行的轻量表格文件查看器，面向大 CSV、TSV、TXT 和 Excel 文件的查看、检索、复制与导出。CSV 解析在浏览器 Web Worker 中完成，文件不会上传到服务器。

## 项目结构

```text
file-viewer/
├─ index.html                    # 单页应用，内嵌样式、主线程逻辑和 CSV Worker
├─ package.json                  # 本地运行与测试脚本
├─ scripts/
│  └─ serve.mjs                  # 零依赖静态服务器
├─ tests/
│  └─ csv-worker-core.test.mjs   # CSV Worker 核心行为测试
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

## 已实现功能

- 拖拽或选择本地文件，CSV/TSV/TXT 离线读取。
- CSV 自动识别逗号、Tab、分号、竖线分隔符。
- 支持引号字段、字段内逗号、字段内换行、双引号转义。
- 自动 UTF-8 解码，UTF-8 失败后尝试 GB18030/GBK。
- Web Worker 解析 CSV，主线程显示进度，避免解析阶段锁死页面。
- 虚拟滚动表格、固定表头、行号、横向滚动。
- 列宽拖拽、列隐藏/显示、点击列名排序。
- Header 类 Excel 筛选菜单：升序/降序、搜索本列值、按值勾选过滤、清除本列筛选。
- 超长单元格表格内只显示 300 字摘要。
- 点击单元格在右侧查看全文，双击打开大文本弹窗。
- 全文查看支持复制、搜索、字符数、行数、等宽字体、分块加载。
- 全表搜索、按列搜索、大小写敏感、只显示命中行、命中高亮。
- 文件信息展示：文件名、大小、行列数、编码、分隔符、解析耗时。
- 异常检测：列数不一致、空字段比例高、超长字段。
- 导出当前筛选后的可见列 CSV。
- 导出异常行报告 CSV。
- 右键菜单：复制单元格、复制整行、复制列名、查看完整内容。

## Excel 支持

Excel 的 XLSX/XLS 结构是压缩包加 XML 或二进制工作簿，纯手写解析不适合 MVP。项目采用 SheetJS 作为可选第三方库：

1. 优先加载 `vendor/xlsx.full.min.js`
2. 本地文件不存在时再尝试 CDN：`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`

如果需要完全离线 Excel 支持，把 SheetJS 浏览器版文件放到：

```text
vendor/xlsx.full.min.js
```

CSV 功能不依赖任何第三方库。

## 设计取舍

- MVP 重点优化大 CSV 查看，行数通常不超过 1000，因此数据会保留在浏览器内存中，DOM 只渲染可视行。
- 单个超长 cell 不进入表格 DOM 全量渲染，只在详情面板按块显示。
- CSV 解析使用 Worker 内自定义状态机，避免主线程阻塞，并覆盖常见 CSV 引号规则。
- Excel 解析当前在主线程执行，适合常规工作簿；超大 Excel 后续可迁移到专用 Worker。

## 后续可扩展

- 解析结果分页缓存到 IndexedDB，降低超大文件内存压力。
- Excel Worker 化并内置 vendor 包。
- 增加多 sheet 切换。
- 增加列类型推断、数值过滤、正则搜索。
- 保存列宽、隐藏列和搜索偏好到 localStorage。
