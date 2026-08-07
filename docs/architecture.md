# File Viewer Architecture

本文档记录 `file-viewer` 当前单页应用架构，重点说明主要模块、数据流、状态边界、Worker 同步、缓存失效规则，以及后续新增功能时需要注意的维护约束。

当前应用仍以构建后的 `index.html` 为唯一运行入口。开发态源码位于 `src/`，`scripts/build-single-html.mjs` 会将模板、样式、主线程逻辑、共享纯函数，以及 CSV/JSONL、查询、大文件、Excel Worker 源码内联到单页产物中。

## Runtime Shape

```text
Browser
├─ index.html
│  ├─ HTML markup
│  ├─ CSS
│  ├─ <script id="csv-worker-source" type="text/plain">
│  ├─ <script id="query-worker-source" type="text/plain">
│  ├─ <script id="excel-worker-source" type="text/plain">
│  └─ main application script
└─ Blob Workers

Build input
└─ vendor/xlsx.full.min.js (SheetJS 0.18.5, SHA-256 verified, embedded only in the Excel Worker)
```

Local serving is done by `scripts/serve.mjs`; static file access is enough for normal use. The generated document includes a restrictive CSP: no runtime network connection, an exact hash for the main application script, and Blob Workers only.

## Source Map

- `index.template.html`: single-page shell with inline placeholders.
- `src/app/state.js`: constants, DOM references, mutable application state, row storage, and Worker coordination.
- `src/app/file-io.js`: XLSX conversion helpers, downloads, clipboard writes, and shared file/UI utilities.
- `src/app/filtering.js`: filter state, unique values, active-filter UI, and view recomputation.
- `src/app/profile.js`: column-profile requests, cache rendering, detail-panel mode switching, and profile filter actions.
- `src/app/table.js`: cell rendering, selection, virtualized grid rendering, and resize interactions.
- `src/app/editing.js`: clipboard import/paste, rich cell previews, editing, history, detail UI, and dialogs.
- `src/app/columns.js`: column filter popovers, column overview, derived/concatenated columns, rename, and deletion.
- `src/app/import.js`: dataset setup and CSV, JSONL, and Excel import orchestration.
- `src/app/export.js`: row-window controls and filtered CSV/XLSX export orchestration.
- `src/app/main.js`: remaining workspace commands, event wiring, and application startup.
- `src/shared/*.js`: pure helpers reused by the main thread and Worker sources.
- `src/workers/*.js`: CSV/JSONL parsing, query/filtering/sorting, OPFS-backed large-text data, and Excel parsing Worker logic.
- `vendor/xlsx.full.min.js`: reviewed, pinned SheetJS build input; it is integrity-checked before being inlined into the generated Excel Worker.
- `src/styles.css`: application styling.
- `index.html`: generated single-file distribution artifact.
- `scripts/build-single-html.mjs`: inlines source files into `index.html`.
- `scripts/serve.mjs`: zero-dependency static server.
- `tests/csv-worker-core.test.mjs`: extracts `csv-worker-source` from `index.html` and tests parser behavior.
- `tests/query-worker-filter.test.mjs`: validates query Worker filtering behavior.
- `tests/shared-core.test.mjs`: validates shared pure helpers directly.
- `tests/html-contract.test.mjs`: contract tests for required DOM ids, function hooks, Worker scripts, and high-risk behavior guards.
- `docs/superpowers/*`: historical design and implementation planning notes for specific features.

## Main Layers

The generated single HTML file is organized into these conceptual layers:

1. **Markup and CSS**
   Top toolbar, table viewport, detail panel, popovers, context menu, modal viewer, and status bar.

2. **Shared Pure Helpers**
   Filtering, issue detection, and CSV helpers (including the streaming-compatible complex-field parser and export escaping) are inlined before the scripts that use them.

3. **Worker Sources**
   Worker scripts are embedded as `text/plain` and turned into Blob Workers at runtime with `createInlineWorker(scriptId)`.

4. **DOM Reference Layer**
   `els` centralizes `document.getElementById(...)` lookups.

5. **State Layer**
   `state` is the main mutable model for dataset, view, caches, selection, editing, Worker lifecycle, and UI interaction state.

6. **Data and Query Layer**
   Import parsers produce a dataset shape consumed by `setDataset(result)`. Querying and sorting are routed through the query Worker when ready, with main-thread fallback.

7. **Rendering Layer**
   `renderGrid()`, `renderRowsOnly()`, `renderHeader()`, `renderRows()`, `renderDetail()`, and modal renderers update the DOM from `state`.

8. **Event Wiring**
   Event listeners near the bottom connect controls to state mutations and render/update functions.

## Dataset Lifecycle

Typical CSV/JSONL path:

```text
File selected or dropped
→ handleFiles(...)
→ parseCsvFile(...) or parseJsonlFile(...)
→ csv-worker-source parses text
→ worker returns { headers, rows, issues, file }
→ setDataset(result)
→ rows become chunked rows facade
→ query worker is seeded with row chunks
→ matching local edit-recovery draft is checked
→ recomputeView()
→ renderGrid()
```

Typical Excel path:

```text
File selected or dropped
→ parseExcelFile(...)
→ safety checks for file size and sharedStrings.xml
→ excel-worker-source preferred path
→ worker loads SheetJS and builds first sheet dataset
→ setDataset(result)
```

For CSV/TSV/TXT/JSONL files at or above 24 MiB, `parseLargeTextFile(...)` takes a separate path:

```text
File.stream() → large-data Worker → OPFS chunk files → query / row-page messages
                                               ↓
                                  main-thread viewport row cache
```

The large-data Worker is the canonical row owner. `state.rows` remains a length-compatible facade for UI compatibility, while `getDataRow(...)`, `requestLargeRows(...)`, and `prefetchLargeRows(...)` keep the visible DOM bounded. The current product cap is 256 MiB and the supported target is current desktop Chrome/Edge.

The Excel Worker contains the verified SheetJS source before its own handler code. It never imports runtime code or falls back to the main thread. Oversized or unsafe XLSX failures may offer the XLSX-to-CSV conversion path.

## Dataset Shape

Parser and sheet loaders should ultimately produce:

```js
{
  headers: string[],
  rows: string[][],
  issues: {
    inconsistentRows: Issue[],
    sparseRows: Issue[],
    longFields: Issue[],
    duplicateColumns: Issue[],
  },
  cellMeta: Map<string, CellMeta>,        // main-thread path
  cellMetaEntries: [string, CellMeta][],  // worker-transfer path
  file: {
    name: string,
    size: number,
    encoding: string,
    delimiter: string,
    parseMs: number,
    kind: "CSV" | "JSONL" | "Excel" | "Clipboard",
    sheetCount?: number,
  },
}
```

`setDataset(result)` is the canonical entry point after data load. Avoid manually setting `state.headers`, `state.rows`, or file stats from import code unless there is a very specific reason.

## Row Storage

Rows are stored behind a chunked array facade:

- `state.rows` behaves like an array for existing call sites: `state.rows.length`, `state.rows[index]`, `for...of`, `forEach`, `map`, and `slice`.
- Internally, rows are chunked in `state.rowChunks`.
- Query Worker seeding sends `state.rowChunks`, `rowCount`, and `ROW_CHUNK_SIZE`.

Maintenance rules:

- Use `state.rows[index]` for row lookup.
- Use `state.rows.forEach(...)` or `for...of state.rows` for iteration.
- Avoid `state.rows.toArray()` on large datasets unless the feature truly needs a full materialized array.
- After structural row or column changes, reseed dependent Worker state with `seedQueryWorker()`.
- After loading a dataset, call `setDataset(result)` rather than assigning row chunks directly.

## State Model

Important `state` groups:

| Area | Fields | Notes |
| --- | --- | --- |
| Dataset | `headers`, `originalHeaders`, `rows`, `rowChunks`, `issues`, `cellMeta`, `file` | Canonical table data and metadata. |
| Excel | `excelWorker`, `excelSheetNames`, `activeSheetName`, `xlsxConversion` | The Worker owns SheetJS and workbook state; the main thread never retains a SheetJS workbook. |
| View | `viewIndices`, `rowPositionMap`, `matchedRows`, `visibleColumns`, `columnOrder`, `columnWidths`, `hiddenRows`, `sort`, `rowWindow` | Defines which rows/columns are visible, ordered, excluded, and finally sliced. |
| Filtering | `columnFilters`, `duplicateFilters`, `columnValueCache`, `columnValuePending`, `columnValueTokens`, `columnValueTokenCounter`, `columnFilterMenu` | Column value lists may be computed asynchronously per column; duplicate filters are group-level conditions. |
| Editing | `selected`, `cellEdit`, `editedCells`, `manualHighlights`, `undoStack`, `redoStack` | Cell editing, highlight state, and undo/redo history. |
| Recovery | `datasetRecoveryKey`, `pendingRecoveryDraft`, `recoveryDraftSaveTimer`, `hasBeforeUnloadGuard` | Local edit draft, matching state, delayed persistence, and leave-page protection. |
| Selection | `selectionAnchor`, `selectionRange`, `selectionDrag` | Spreadsheet-style cell, row, column, and all-table selection. |
| Rendering | `renderQueued`, `headerDirty`, `cellVersions`, `cellRenderCache` | Render scheduling and visible cell node caching. |
| Workers | `worker`, `queryWorker`, `queryToken`, `queryRowsVersion`, `queryWorkerReadyVersion`, `queryWorkerDirty` | CSV/JSONL parse worker and query worker lifecycle. |
| Large text | `largeDataWorker`, `largeData` | OPFS-backed rows, bounded row cache, remote row requests, and large-data mutations. |
| Modal/detail | `detailVisibleChars`, `modalVisibleChars`, `modalCell`, `modalSplitResize`, `modalResize` | Large-cell viewing and split/resize state. |

## Workers

### CSV/JSONL Worker

`csv-worker-source` owns:

- CSV delimiter detection.
- CSV state-machine parsing. Standard CSV quoting remains the primary rule; the parser also conservatively retains unquoted JSON object/array fields, backslash-escaped delimiters, and fenced Markdown blocks so their commas/newlines do not become table boundaries.
- JSONL object expansion.
- Text decoding with UTF-8 and GB18030/GBK fallback.
- Parser issue detection during CSV/JSONL import, including unclosed quotes, structured fields, or Markdown fences.

Main-thread entry points:

- `parseCsvFile(file)`
- `parseJsonlFile(file)`
- `createCsvWorker()`

Testing:

- `tests/csv-worker-core.test.mjs` extracts the embedded source and validates core parser behavior.

### Query Worker

`query-worker-source` owns:

- Current dataset row chunks.
- Search, matched-row calculation, column filter application, duplicate-value filtering, hidden-row exclusion, sorting, and final row-window slicing.
- Asynchronous unique-value counting for large column filter menus.

Main-thread coordination:

- `seedQueryWorker()` sends chunks after dataset or structural changes.
- `runQueryInWorker(request)` sends query requests.
- `applyQueryResult(result)` applies returned `viewIndices` and `matchedRows`.
- `computeViewSync(request)` is the fallback when Worker state is not ready.
- `patchQueryWorkerCells(changes)` patches edited cells without reseeding the entire dataset.

Staleness guards:

- `queryToken` invalidates old query replies.
- `queryRowsVersion` matches replies to the current dataset.
- `queryWorkerDirty` forces reseeding when edits happen before Worker readiness.

### Large Data Worker

`large-data-worker-source` is selected only for CSV/TSV/TXT/JSONL files of at least 24 MiB. It streams the `File`, stores JSON row chunks in OPFS, and services `query`, `get-rows`, `patch-cells`, `transform-columns`, unique-value and profile requests. It intentionally does not post a complete row array to the main thread. It uses the same stateful CSV parser as the normal Worker, including across decoded stream chunk boundaries.

CSV export obtains small row pages through this Worker and writes Blob parts incrementally. XLSX export remains available, but SheetJS necessarily materializes the export workbook; callers should prefer CSV for the lowest memory use.

### Excel Worker

`excel-worker-source` owns the Excel parse and XLSX export paths:

- Receives the SHA-256-verified SheetJS source at build time; it performs no `importScripts()` or network request at runtime.
- Reads workbook with guarded low-memory options.
- Converts the selected sheet to headers/rows/issues.
- Returns transferable `cellMetaEntries` instead of a `Map`.
- Builds XLSX export buffers from a matrix supplied by the main thread.

Main-thread coordination:

- `startExcelWorkerParse(file, loadToken, startedAt)` starts workbook parsing.
- `requestExcelWorkerSheet(sheetName, startedAt, loadToken)` switches sheets through the Worker.
- `applyExcelWorkerSheetResult(message, loadToken)` normalizes and applies Worker results.
- `exportXlsxInWorker(matrix)` delegates XLSX writing to a temporary Worker.

Staleness guard:

- Excel parsing uses `loadToken` so stale async results do not overwrite a newer load.

## Rendering Model

Table rendering is virtualized.

- `renderGrid()` marks `headerDirty = true` and schedules a full table render.
- `renderRowsOnly()` schedules only row rendering and is used for scroll events.
- `queueGridRender()` coalesces rendering with `requestAnimationFrame`.
- `renderHeader()` rebuilds the sticky header only when needed.
- `renderRows()` renders only visible virtual rows plus buffer rows.

Maintenance rules:

- Use `renderRowsOnly()` for scroll-like changes that do not affect headers.
- Use `renderGrid()` when visible columns, column widths, sort indicator, selected columns, or dataset shape may affect the header.
- Keep `renderRows()` free of full-table work.
- Avoid adding expensive parsing or analysis inside row rendering. Prefer cached helpers or Worker precomputation.

## Cache And Invalidation Rules

| Cache | Owner | Invalidated When |
| --- | --- | --- |
| `columnValueCache` | Main thread | Dataset load, column edits, custom column add/delete, filter value source changes. |
| `columnValuePending` | Main thread | Same as column value cache, or when async result/error arrives. |
| `columnValueTokens` | Main thread | Cleared with column value cache, or per column when its async result/error arrives. |
| `cellRenderCache` | Main thread | Dataset load, structural column changes, or naturally by `cellVersions` after edits. |
| `cellVersions` | Main thread | Incremented by `touchCellVersion(rowIndex, columnIndex)` on cell value mutation. Reset on dataset/structural changes. |
| `rowPositionMap` | Main thread | Rebuilt whenever `viewIndices` changes. |
| Query Worker chunks | Query Worker | Seeded on dataset load and structural changes; patched on cell edits. |
| `issues` | Main thread / Workers | Full scan on import and structural changes; incremental row refresh on cell edits. |

Common mutation recipes:

### Editing One Cell

```text
setCellValue(...)
→ touchCellVersion(...)
→ invalidateColumnValueCache(columnIndex)
→ refreshIssuesAfterCellEdits(...)
→ patchQueryWorkerCells(...)
→ recomputeView()
→ renderDetail()/renderModal()/syncEditSummary()
```

### Adding A Custom Column

```text
mutate headers/originalHeaders/rows
→ update visibleColumns/customColumns/columnOrder/columnWidths
→ invalidateColumnValueCache()
→ reset cellVersions and cellRenderCache
→ analyzeRows(...)
→ seedQueryWorker()
→ updateSearchColumns()
→ renderColumnPopover()/renderColumnOverview()
→ recomputeView()
```

### Deleting A Custom Column

```text
remove header/originalHeader/row cells
→ reindex columnOrder, filters, customColumns, cellMeta
→ reindex edit/highlight maps and history
→ invalidate caches
→ seedQueryWorker()
→ recomputeView()
```

## Feature Workflows

### File Import

Use `handleFiles(files, sourceFileHandle)` as the format router. New file types should either produce the standard dataset shape or explicitly document why they bypass `setDataset`.

### Clipboard Import

Clipboard import builds a normal dataset through `buildClipboardDataset(...)` and then calls `setDataset(dataset)`.

### Search And Filtering

`recomputeView()` is the canonical view recalculation entry point. It builds a serializable request with `getViewQueryRequest()`, tries the Worker path, then falls back to `computeViewSync(request)`.

Column filter value lists use `getColumnUniqueValues(columnIndex)`. Large datasets can return an empty list while Worker computation is pending; UI must handle `isColumnValuePending(columnIndex)`.

Duplicate-value filters use exact non-empty cell strings and count duplicates across the full dataset. `rowWindow` is applied after filtering, exclusions, and sorting, so `first` and `range` always refer to positions in the current result.

### Derived Columns

`addDerivedColumn(...)` supports:

- Empty column.
- Sequence column.
- Copy existing column.
- Constant user-configured content.

Any new derived mode should update only this function and the add-column UI unless it needs a new shared state model.

### Concatenated Columns

Concatenated columns are custom columns. They reuse the custom-column deletion path and must append to both `headers` and `originalHeaders`.

### Export

Export uses current `viewIndices` and visible columns. CSV export is chunked through Blob parts; do not reintroduce one giant joined string for large exports.

### Edit Recovery And Leave Protection

`v2.3.5` treats changed or currently edited cells as recoverable local changes. The app uses `overscroll-behavior-x: contain` on the page and horizontal table regions to reduce touchpad overscroll navigation. When an edit exists, a `beforeunload` listener is attached; it is removed again once no cell changes remain.

Recovery drafts contain only the changed cell coordinates and values, not the complete source file. They are written immediately to `sessionStorage` and best-effort to IndexedDB. The draft key combines file kind, name, size, modification time, and sheet/delimiter so a matching draft can be offered after the same file is loaded again. Do not broaden this into complete-file persistence without revisiting the local-data privacy statement and capacity limits.

## Async And Stale Result Guards

Use these guards consistently:

- `loadToken`: invalidates stale file parsing and Excel sheet loading.
- `queryToken`: invalidates stale query Worker responses.
- `columnValueTokens`: invalidates stale async unique-value responses per column.
- `queryRowsVersion`: ties Worker query data to the current dataset.

Rule of thumb: any async operation that can finish after a newer file load or newer query state must carry a token/version.

## Testing Strategy

Current tests are lightweight and fast:

- Parser behavior tests for CSV/JSONL Worker core, including relaxed JSON/Markdown fields and escaped-quote chunk boundaries.
- Query Worker tests for shared filtering semantics.
- Shared-core tests for filter, issue-analysis, and CSV escaping helpers.
- HTML contract tests for DOM ids, major functions, important implementation constraints, and embedded Worker syntax.

When adding features:

1. Add or update contract tests for new DOM ids and function hooks.
2. Add parser/worker-core tests if pure data behavior changes.
3. If a feature introduces async behavior, add a contract for stale guard usage.
4. Prefer real browser tests for future high-risk UI flows such as file import, filtering, adding columns, editing, and exporting.

## Known Maintenance Risks

- `index.html` is generated and still large. Review source files under `src/`, then rebuild before testing or distribution.
- Many tests assert presence of hooks rather than full runtime behavior. They prevent accidental removal but do not replace browser interaction tests.
- Shared helpers are text-inlined by the build script. Keep them free of DOM APIs, module syntax, and side effects so they can run in both the main thread and Workers.
- Cache invalidation is now a significant part of correctness. New mutations should explicitly consider all caches listed above.
- SheetJS is a fixed local build input. Any upgrade must update its SHA-256, SBOM, third-party notice, and Worker runtime test together.

## Application Source Boundaries

Application source is split along stable ownership boundaries while preserving the single-page distribution:

```text
src/
├─ app/
│  ├─ state.js
│  ├─ file-io.js
│  ├─ filtering.js
│  ├─ profile.js
│  ├─ table.js
│  ├─ editing.js
│  ├─ columns.js
│  ├─ import.js
│  ├─ export.js
│  └─ main.js
├─ workers/
│  ├─ csv-worker.js
│  ├─ query-worker.js
│  └─ excel-worker.js
└─ shared/
   ├─ csv-utils.js
   ├─ column-profile.js
   ├─ filters.js
   ├─ issues.js
   ├─ row-chunks.js
   └─ excel-utils.js
```

These files are ordered build fragments, not browser ES modules. `scripts/build-single-html.mjs` loads them in the order shown and inlines them into one shared script scope in `index.html`. Keep declarations in the owning fragment, avoid introducing top-level side effects before `main.js`, and update the build-order contract test whenever a fragment is added or moved.
