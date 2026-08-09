# Changelog

All notable user-facing changes are documented here.

## [Unreleased]

### Fixed

- 修复 JSON / HTML / Markdown 代码块列较多的合法 CSV 被判成分号分隔、整表塌成一列：分隔符评分里的方差罚没有上限，宽容解析把少数几行切坏（几百列）就能把一个 17/19 行都完美复现表头的逗号打到 -246 分，输给文件里几乎不存在、因此"很稳定"的分号。方差罚现在封顶到 -12，与 headerMatch 同量级，少数畸形行不能否决绝大多数行给出的证据。

## [2.3.9] - 2026-08-09

### Fixed

- 修复大文件中每个 cell 都很长时，滚动后的表格区域长时间显示空白、但点击 cell 后详情仍能读到内容。超长行预览改为固定并发数读取 cell 前缀，主线程同时去重正在读取的行，避免快速滚动重复排队。
- 修复标题行、导出说明、`#` 注释行占着表头位置，导致列名变成 `月度报表`、`Column 2`…，真表头降级成第一行数据。表头改从第一条不是单格行的记录取，最多跳 3 行；被跳过的标题行仍按原顺序保留为数据行，不丢内容，并给出「表头不在首行」提示。表头比数据行窄（行尾多一个分隔符）是合法的，不会被当成标题行跳过。
- 修复标题行、导出说明、`#` 注释行排在表头之前时，`;`、`|`、Tab 分隔的文件整表塌成一列。分隔符探测不再要求候选必须切开第一条记录：其它候选也切不开的行按前言免费跳过，最多跳 3 行；其它候选能切开的行仍可跳，但要付代价，`a|b|c|d|e` 这类标签列因此无法靠跳表头反超真分隔符。
- 修复文件开头的空行或 `,,` 占位行顶替表头，导致列名全变成 `Column 1`、真表头降级成第一行数据，另存后这一改写还会写进文件。普通与大文件两条路径统一跳过表头之前的全空记录。
- 修复只有一行且结尾没有换行的文件（如 `id;name;age`）一律被判成逗号分隔：分隔符探测在样本覆盖完整输入时才补齐最后一条记录，大文件的截断样本仍不补。
- `.tsv` 的分隔符改由扩展名确定，不再交给探测（带标题行的 TSV 会被判成逗号）。`.csv` 不强制逗号，部分地区导出的 CSV 用分号。

### Added

- 导入设置里新增「分隔符」和「表头行」两个手动入口：探测存在无法消除的歧义（前言行与正文里的 Markdown 表格在样本里是同构的），判错时可以手动指定并立即重新解析当前文件。换文件会自动回到「自动」，避免上一份文件的设置静默套到新文件上；Excel 与 JSONL 下这两个控件不可用。
- 整表只解析出一列、而换一个候选分隔符就能切出多列时，导入异常里给出「分隔符可能判断有误」提示，不再静默。
- 新增分隔符探测回归语料 `tests/delimiter-corpus.test.mjs`，覆盖四种分隔符、标题行/前言行/注释行、前导空行与占位行、Markdown 表格与标签列干扰、宽表、无结尾换行等 45 种形态。

### Changed

- 分隔符评分新增两项防护，抵消"允许跳过表头行"带来的风险：`| a | b |` 这类给内容包边、每条记录首尾字段同时为空的用法大幅降权；切得更宽的加分封顶，避免引号内一张 60 列的 Markdown 表凭宽度压过 38 列的真表头。

### Known Issues

- 前言行超过 3 行时，分隔符探测与表头行识别都会放弃，整表塌成一列并给出「分隔符可能判断有误」告警。

## [2.3.8] - 2026-08-09

### Fixed

- 修复单元格里像 JSON 开头的 `[` / `{`（`[2024上半年`、`[to do`、`[null 值`）把后面的列和行全部吞进同一个 cell，表格看上去被压缩成一列。括号配平的普通文本不再被当成 JSON；未闭合候选在文件结束时按标准 CSV 回滚。宽容解析仍保留合法 JSON，并用严格 CSV 影子状态复核候选首行和后续完整记录。
- 修复逗号 CSV 的超长字段包含多行 Markdown 表格时，大量 `|` 误导分隔符探测，导致全部原始表头进入第一列、其余列显示为 `Column 2` 等自动名称。候选分隔符现在必须能实际拆分首条非空表头记录。
- 修复大文件模式回滚推测性解析时字节偏移错位一位，未闭合的 Markdown 围栏回滚后整表内容串位（`bob` 变成 `\nbo`）。

## [2.3.7] - 2026-08-09

### Fixed

- 修复 UTF-8 中文大文件被误判为 GB18030 而整表乱码：编码采样按字符边界回退截断，GB18030 回退也不再无条件成功。
- 修复单元格里未闭合的 `[`、`{` 或 ``` 会把后面所有行吞进同一个 cell 的问题。开括号需要后面真的跟着 JSON 才进入结构化解析，引号内还会再前瞻一位区分收尾引号；宽容解析另有字符预算，超出后回滚重新按标准 CSV 解析。
- 修复导出的 CSV 无法被本应用自己读回来：含反斜杠、行首 `{`/`[`、含反引号的值现在会加引号。
- 修复导出时给负数和 `+` 开头的数值加 `'` 前缀，导致数值列变成文本列。
- 修复以反斜杠结尾的字段（如 Windows 路径 `C:\dir\`）并列：引号内按收尾引号处理，未加引号时按表头列数拆回来。
- 修复某列内含 `|` 或 `;` 时分隔符被误判：候选分隔符现在还要能稳定复现表头列数。
- 修复 GB18030 大文件中次字节为 `0x5C` 的汉字被当成转义符而少切一列。
- 修复大文件模式下正好 500 字符的预览不显示"点击查看全文"，超长内容被无声截断。

### Changed

- 大文件模式不再为全表常驻预览字符串：预览按需从原文件读取，索引期堆占用从约 7.2 倍文件体积降到约 1.1 倍（每 cell 约 119 字节降到约 18 字节），偏移索引直接写入可增长的 TypedArray。
- 大文件索引吞吐从约 9.5 MiB/s 提升到约 25 MiB/s。
- 唯一值统计、列画像和重复值扫描现在可被新请求取消；视口读取不再排在这些全表扫描后面，滚动不会被冻结。
- 大 JSONL 的整表扫描改为按字节批次读取，不再每行一次 `File.slice()`。
- 大文件模式下的选区渲染不再对每个可见 cell 在 `viewIndices` 上线性查找。

## [2.3.6] - 2026-08-08

### Changed

- 将大文本文件上限提高到 500 MiB，并把大文件主路径从 OPFS 行分块改为原始 `File` 的流式字节扫描与 cell 偏移索引，不再复制完整源文件。
- 表格常驻 500 字预览；完整 cell 通过 `File.slice()` 按需读取，预览、完整 cell 和完整行缓存均按估算字节数限制。
- 超长 cell 详情改为分页展示；大文件 CSV 以小批次读取并通过 File System Access API 流式写出。

### Fixed

- 修复“行数约 1000、列数较少但每个 cell 极长”的 300–500 MiB CSV 在载入阶段因整块 JSON 序列化、反序列化而长时间无响应的问题。
- 增加载入进度看门狗、Worker 异常处理和查询进度反馈；GB18030、复杂 CSV 字段及跨流分块边界保持兼容。

### Limitations

- 超过 128 MiB 的源文件暂不执行整列排序、重复值统计、列画像和 XLSX 导出；不支持流式保存的浏览器也不会对这类文件回退到高内存 CSV 导出。

## [2.3.5] - 2026-08-03

### Fixed

- CSV 普通与大文件解析路径统一使用复杂字段兼容状态机，避免 JSON、反斜杠转义和 Markdown 代码块中的逗号或换行被拆成额外列、行。
- 复杂字段未闭合时保留导入异常提示；标准 CSV 双引号转义在流式分块边界仍可正确解析。

### Changed

- 发布 zip 只包含可直接打开的最终 `index.html`；许可证、SBOM、变更日志和安全文档继续在仓库中维护。

## [2.3.4] - 2026-07-29

### Changed

- CSV、TSV、TXT 和 JSONL 在 24 MiB 以上改用流式大文件路径：Worker 分块写入浏览器 OPFS，主线程按视口按需读取，当前上限为 256 MiB（覆盖 200 MiB 目标）。
- 大文件模式保留搜索、筛选、排序、编辑、自定义列、拼接列与导出，并在读取时提供进度和取消操作。
- CSV 普通与大文件解析路径统一使用流式状态机；兼容常见的非标准 JSON、反斜杠转义和 Markdown 代码块字段，同时对未闭合复杂字段保留异常提示。

### Fixed

- Reduced accidental browser-back navigation from horizontal touchpad overscroll.
- Warned before leaving a page with edited or actively edited cells.

### Added

- Local recovery drafts for changed cell values and in-progress cell edits.
- Release governance: reproducible packaging, artifact checksums, MIT licensing, third-party notices, SBOM, security reporting guidance, and GitHub Actions validation.

### Security

- Pinned SheetJS Community Edition `0.18.5` as a local, SHA-256-verified build input and removed the runtime CDN loader.
- Moved XLSX export into the isolated Excel Worker; the main application thread no longer executes SheetJS.
- Added a restrictive generated CSP that blocks runtime network connections and permits only the hashed application script and Blob Workers.

### Privacy

- Recovery drafts store only edited cell coordinates and values in the current browser; they do not store complete source files or upload data.

[2.3.4]: https://github.com/terrylyl/file-viewer/releases/tag/v2.3.4
[2.3.5]: https://github.com/terrylyl/file-viewer/releases/tag/v2.3.5
[2.3.6]: https://github.com/terrylyl/file-viewer/releases/tag/v2.3.6
[2.3.7]: https://github.com/terrylyl/file-viewer/releases/tag/v2.3.7
[2.3.8]: https://github.com/terrylyl/file-viewer/releases/tag/v2.3.8
[2.3.9]: https://github.com/terrylyl/file-viewer/releases/tag/v2.3.9
