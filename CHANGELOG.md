# Changelog

All notable user-facing changes are documented here.

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
