import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("index.html contains the required application regions", () => {
  for (const id of [
    "dropZone",
    "fileInput",
    "clipboardImportButton",
    "clipboardImportPopover",
    "clipboardFirstRowHeaderInput",
    "gridViewport",
    "headerRow",
    "rowLayer",
    "detailPanel",
    "searchInput",
    "exportCsvButton",
    "exportFormatSelect",
    "exportSplitCountInput",
    "csv-worker-source",
    "columnFilterPopover",
    "columnFilterSearchInput",
    "columnFilterValues",
    "columnOverview",
    "clearAllFiltersButton",
    "wrapCellsInput",
    "filteredRowStats",
    "sheetSelect",
    "addColumnButton",
    "addColumnPopover",
    "newColumnNameInput",
    "newColumnModeSelect",
    "copyColumnSelect",
    "deleteCustomColumnButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("application script exposes Excel-like header filtering behavior", () => {
  assert.match(html, /columnFilters/, "missing column filter state");
  assert.match(html, /openColumnFilterMenu/, "missing header filter menu opener");
  assert.match(html, /rowPassesColumnFilters/, "missing row filter predicate");
  assert.match(html, /renderColumnFilterValues/, "missing filter value renderer");
  assert.match(html, /clearAllFilters/, "missing global clear filters action");
  assert.match(html, /renderColumnOverview/, "missing column overview renderer");
  assert.match(html, /hiddenRows/, "missing hidden row state");
  assert.match(html, /rowPassesHiddenRows/, "missing hidden row predicate");
  assert.match(html, /hideRowsByCurrentColumnFilter/, "missing header action to hide rows");
  assert.match(html, /dragColumn/, "missing draggable column reorder behavior");
  assert.match(html, /renderFilteredRowStats/, "missing filtered row stats renderer");
  assert.match(html, /saveTextFile/, "missing enhanced export save helper");
});

test("duplicate columns are visibly marked in headers", () => {
  assert.match(html, /isDuplicateColumn/, "missing duplicate column predicate");
  assert.match(html, /duplicate-column-dot/, "missing duplicate column dot marker");
  assert.match(html, /\.header-cell\.duplicate-column/, "missing duplicate column header styling");
});

test("Excel cell styles and rich text are extracted and rendered", () => {
  assert.match(html, /extractExcelCellMeta/, "missing Excel cell metadata extraction");
  assert.match(html, /normalizeExcelColor/, "missing Excel color normalizer");
  assert.match(html, /applyCellMetaStyle/, "missing cell style application");
  assert.match(html, /renderCellDisplayContent/, "missing styled cell renderer");
  assert.match(html, /cellStyles:\s*true/, "Excel parser should request cell styles");
  assert.match(html, /cellHTML:\s*true/, "Excel parser should request rich text HTML");
});

test("Excel workbooks expose sheet selection", () => {
  assert.match(html, /id="sheetSelect"/, "missing Excel sheet selector");
  assert.match(html, /updateSheetSelect/, "missing sheet selector renderer");
  assert.match(html, /loadExcelSheet/, "missing sheet loading function");
  assert.match(html, /SheetNames/, "Excel parser should inspect workbook sheets");
  assert.match(html, /sheetSelect\.addEventListener\("change"/, "sheet selector should respond to changes");
});

test("Excel sheet conversion avoids spreading large matrices", () => {
  assert.match(html, /getMatrixColumnCount/, "missing iterative matrix column counter");
  assert.doesNotMatch(html, /Math\.max\(\s*\.\.\.matrix\.map/, "large Excel matrices should not be spread into Math.max");
});

test("cell URLs are rendered as clickable links", () => {
  assert.match(html, /detectCellLinks/, "missing URL detector");
  assert.match(html, /appendLinkedText/, "missing linked text renderer");
  assert.match(html, /target = "_blank"/, "links should open in a new tab");
  assert.match(html, /rel = "noopener noreferrer"/, "links should use safe rel attributes");
});

test("users can add derived columns", () => {
  assert.match(html, /addDerivedColumn/, "missing derived column creator");
  assert.match(html, /customColumns/, "missing custom column tracking state");
  assert.match(html, /openAddColumnPopover/, "missing add-column popover opener");
  assert.match(html, /updateCopyColumnOptions/, "missing copy-source column options");
  assert.match(html, /newColumnModeSelect\.addEventListener\("change"/, "new column mode should update controls");
  assert.match(html, /confirmAddColumnButton\.addEventListener\("click"/, "add column confirm action missing");
  assert.match(html, /mode === "sequence"/, "missing sequence column mode");
  assert.match(html, /mode === "copy"/, "missing copy column mode");
});

test("users can create concatenated columns", () => {
  for (const id of [
    "concatenateColumnButton",
    "concatenateColumnPopover",
    "concatenateSchemeSelect",
    "applyConcatenateSchemeButton",
    "concatenateColumnNameInput",
    "concatenateRows",
    "addConcatenateRowButton",
    "cancelConcatenateColumnButton",
    "confirmConcatenateColumnButton",
    "concatenateValidationStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  assert.match(html, /openConcatenateColumnPopover/, "missing concatenate popover opener");
  assert.match(html, /renderConcatenateRows/, "missing concatenate row renderer");
  assert.match(html, /resolveConcatenateItems/, "missing concatenate item resolver");
  assert.match(html, /buildConcatenatedValue/, "missing concatenated value builder");
  assert.match(html, /addConcatenatedColumn/, "missing concatenated column creator");
  assert.match(html, /```markdown/, "concatenated output should include markdown fences");
  assert.match(html, /join\("\\n\\n"\)/, "concatenated blocks should be separated by a blank line");
});

test("users can save and reuse concatenate schemes", () => {
  assert.match(html, /CONCATENATE_SCHEMES_STORAGE_KEY/, "missing concatenate scheme storage key");
  assert.match(html, /MAX_CONCATENATE_SCHEMES\s*=\s*20/, "should cap saved concatenate schemes");
  assert.match(html, /concatenateSchemes:\s*\[\]/, "missing concatenate scheme state");
  assert.match(html, /function loadConcatenateSchemes\(/, "missing scheme loader");
  assert.match(html, /function saveConcatenateScheme\(/, "missing scheme saver");
  assert.match(html, /function renderConcatenateSchemeOptions\(/, "missing scheme select renderer");
  assert.match(html, /function applyConcatenateScheme\(/, "missing scheme applier");
  assert.match(html, /localStorage\.setItem\(CONCATENATE_SCHEMES_STORAGE_KEY/, "schemes should be persisted locally");
  assert.match(html, /sourceName:\s*state\.headers\[item\.columnIndex\]/, "schemes should store source column names");
  assert.match(html, /const matches = state\.headers[\s\S]*?filter\(\(\{ header \}\) => header === sourceName\)/, "scheme application should match by column name");
  assert.match(html, /saveConcatenateScheme\(\{\s*name:\s*columnName,\s*items\s*\}\)/, "successful concatenate should save the scheme");
  assert.match(html, /applyConcatenateSchemeButton\.addEventListener\("click"/, "missing apply scheme action");
});

test("popover outside-click handling survives rerendered click targets", () => {
  assert.match(html, /function eventPathContains\(/, "missing composed event path helper");
  assert.match(html, /event\.composedPath\(\)/, "outside-click handling should read the original event path");
  assert.match(
    html,
    /eventPathContains\(event,\s*els\.concatenateColumnPopover\)/,
    "concatenate popover close check should use the event path",
  );
  assert.doesNotMatch(
    html,
    /!els\.concatenateColumnPopover\.contains\(event\.target\)\s*&&\s*event\.target !== els\.concatenateColumnButton/,
    "target-only contains checks close the popover after deleting a rerendered row",
  );
});

test("users can rename and restore individual column names", () => {
  for (const id of ["renameColumnInput", "renameColumnButton", "restoreColumnNameButton"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  assert.match(html, /originalHeaders/, "missing original header state");
  assert.match(html, /renameColumn/, "missing column rename function");
  assert.match(html, /restoreColumnName/, "missing restore column name function");
});

test("users can delete only custom columns", () => {
  assert.match(html, /deleteCustomColumn/, "missing custom column deletion function");
  assert.match(html, /isCustomColumn/, "missing custom column predicate");
  assert.match(html, /deleteCustomColumnButton\.addEventListener\("click"/, "missing delete custom column action");
  assert.match(html, /deleteCustomColumnButton\.disabled\s*=\s*!isCustomColumn/, "delete should be disabled for source columns");
});

test("custom columns accept pasted table data", () => {
  assert.match(html, /function parseClipboardTable\(/, "missing clipboard table parser");
  assert.match(html, /function pasteClipboardTextIntoSelection\(/, "missing custom-column paste writer");
  assert.match(html, /targetColumns\.every\(\(columnIndex\) => isCustomColumn\(columnIndex\)\)/, "paste targets should be custom columns only");
  assert.match(html, /invalidateColumnValueCache\(columnIndex\)/, "pasted columns should invalidate value caches");
  assert.match(html, /state\.cellMeta\.delete\(`\$\{rowIndex\}:\$\{columnIndex\}`\)/, "pasted cells should clear stale cell metadata");
  assert.match(html, /document\.addEventListener\("paste",\s*handlePasteIntoCustomColumns\)/, "document should listen for paste events");
});

test("users can import a new table from clipboard before loading a file", () => {
  assert.match(html, /id="clipboardImportButton"/, "missing clipboard import entry button");
  assert.match(html, /id="clipboardImportPopover"/, "missing clipboard import options popover");
  assert.match(html, /id="clipboardFirstRowHeaderInput"[^>]*checked/, "clipboard import should default to first row as header");
  assert.match(html, /function openClipboardImportPopover\(/, "missing clipboard import popover opener");
  assert.match(html, /function buildClipboardDataset\(/, "missing clipboard dataset builder");
  assert.match(html, /function importClipboardTable\(/, "missing clipboard import action");
  assert.match(html, /navigator\.clipboard\.readText\(\)/, "clipboard import should read clipboard text");
  assert.match(html, /firstRowAsHeader \? rows\[0\] : \[\]/, "clipboard import should support optional header row");
  assert.match(html, /setDataset\(dataset\)/, "clipboard import should initialize the normal dataset");
  assert.match(html, /kind:\s*"Clipboard"/, "clipboard import should identify its source kind");
  assert.match(html, /clipboardImportButton\.disabled\s*=\s*Boolean\(state\.headers\.length \|\| state\.rows\.length\)/, "clipboard import should disable after data is loaded");
});

test("large column filters avoid repeated full-table work", () => {
  assert.match(html, /columnValueCache/, "missing per-column unique value cache");
  assert.match(html, /function invalidateColumnValueCache\(/, "missing column filter cache invalidation");
  assert.match(html, /function getCachedColumnUniqueValues\(/, "missing cached unique value accessor");
  assert.match(html, /function isColumnFilterValueSelected\(/, "missing selection helper that avoids default all-value sets");
  assert.match(html, /mode:\s*"exclude"/, "filter model should support exclusions for mostly-selected large columns");
  assert.match(html, /const activeColumnFilters = getActiveColumnFilters\(\)/, "row filtering should precompute active filters once");
  assert.match(html, /rowPassesColumnFilters\(row,\s*activeColumnFilters\)/, "row filtering should reuse precomputed filters");
  assert.match(html, /const debouncedColumnFilterSearch = debounce\(/, "column filter search should be debounced");
  assert.doesNotMatch(
    html,
    /return new Set\(getColumnUniqueValues\(columnIndex\)\.map/,
    "default selected filter state should not allocate a Set for every unique value",
  );
});

test("file loading guards against stale async results", () => {
  const csvStart = html.indexOf("async function parseCsvFile(file)");
  const csvEnd = html.indexOf("async function ensureSheetJs()", csvStart);
  const csvSource = html.slice(csvStart, csvEnd);
  const excelStart = html.indexOf("async function parseExcelFile(file)");
  const excelEnd = html.indexOf("async function openFileWithPicker()", excelStart);
  const excelSource = html.slice(excelStart, excelEnd);

  assert.match(html, /loadToken/, "missing load token state");
  assert.match(html, /function beginLoad\(/, "missing load lifecycle starter");
  assert.match(html, /function isCurrentLoad\(/, "missing stale load guard");
  assert.match(csvSource, /const loadToken = beginLoad\(\);/, "CSV parsing should start a guarded load");
  assert.match(csvSource, /if \(!isCurrentLoad\(loadToken\)\) return;/, "CSV async steps should ignore stale work");
  assert.match(excelSource, /const loadToken = beginLoad\(\);/, "Excel parsing should start a guarded load");
  assert.match(excelSource, /loadExcelSheet\(sheetName,\s*startedAt,\s*loadToken\)/, "Excel sheet loading should preserve the active load token");
  assert.match(html, /if \(state\.worker\) state\.worker\.terminate\(\);/, "starting a new load should terminate an active CSV worker");
});

test("worker object URLs are released", () => {
  assert.match(html, /const workerUrl = URL\.createObjectURL\(blob\)/, "worker should keep its object URL");
  assert.match(html, /URL\.revokeObjectURL\(workerUrl\)/, "worker object URL should be revoked after Worker creation");
});

test("visible row position lookups are cached", () => {
  assert.match(html, /rowPositionMap:\s*new Map\(\)/, "missing visible row position map state");
  assert.match(html, /function rebuildVisibleRowPositionMap\(/, "missing visible row position map builder");
  assert.match(html, /state\.rowPositionMap\.set\(rowIndex,\s*position\)/, "row position map should store visible positions");
  assert.match(html, /return state\.rowPositionMap\.get\(rowIndex\) \?\? -1;/, "row position lookup should use the cache");
});

test("custom paste refreshes row issues incrementally", () => {
  assert.match(html, /function appendRowIssues\(/, "missing per-row issue analyzer");
  assert.match(html, /function refreshIssuesAfterCellEdits\(/, "missing incremental edited-row issue refresh");
  assert.match(html, /const touchedRows = new Set\(\)/, "paste should track touched rows");
  assert.match(html, /refreshIssuesAfterCellEdits\(touchedRows\)/, "paste should not force a full issue scan");
});

test("filtered CSV export avoids building one giant joined string", () => {
  const start = html.indexOf("async function exportFilteredCsv(");
  const end = html.indexOf("function flattenIssues()", start);
  const source = html.slice(start, end);
  assert.match(source, /const parts = \[/, "CSV export should collect blob parts");
  assert.match(source, /parts\.push\(chunk\.join\(""\)\)/, "CSV export should flush row chunks");
  assert.doesNotMatch(source, /lines\.join\("\\r\\n"\)/, "filtered CSV export should not join every row into one huge string");
});

test("filtered export supports CSV by default and optional XLSX", () => {
  assert.match(html, /id="exportFormatSelect"/, "missing export format selector");
  assert.match(html, /<option value="csv" selected>CSV<\/option>/, "CSV should be the default export format");
  assert.match(html, /<option value="xlsx">XLSX<\/option>/, "XLSX should be available as an export format");
  assert.match(html, /async function exportFilteredXlsx\(/, "missing filtered XLSX export path");
  assert.match(html, /async function exportFilteredTable\(/, "missing export dispatcher");
  assert.match(html, /XLSX\.utils\.aoa_to_sheet\(matrix\)/, "XLSX export should build a worksheet from visible filtered rows");
  assert.match(html, /XLSX\.writeFile\(workbook, `\$\{base\}-filtered\$\{suffix\}\.xlsx`\)/, "XLSX export should save an xlsx file");
  assert.match(html, /exportFormatSelect\.value === "xlsx"/, "export dispatcher should branch on the selected format");
  assert.match(html, /exportCsvButton\.addEventListener\("click",\s*exportFilteredTable\)/, "export button should use the selected format");
});

test("filtered export can split output into multiple part files", () => {
  assert.match(html, /id="exportSplitCountInput"[^>]*type="number"[^>]*value="1"/, "split count input should default to one file");
  assert.match(html, /function getExportSplitCount\(/, "missing split count reader");
  assert.match(html, /function getFilteredExportRowGroups\(/, "missing filtered row grouping helper");
  assert.match(html, /const rowsPerPart = Math\.ceil\(rowIndexes\.length \/ splitCount\)/, "split export should compute rows per part from visible filtered rows");
  assert.match(html, /`_part\$\{partIndex \+ 1\}`/, "split export should add part suffixes");
  assert.match(html, /exportFilteredCsv\(rowGroups\[partIndex\],\s*suffix\)/, "CSV export should receive the current part rows");
  assert.match(html, /exportFilteredXlsx\(rowGroups\[partIndex\],\s*suffix\)/, "XLSX export should receive the current part rows");
  assert.match(html, /getFilteredExportMatrix\(rowIndexes = state\.viewIndices\)/, "XLSX matrix helper should accept a row subset");
  assert.match(html, /exportSplitCountInput\.disabled\s*=\s*!state\.rows\.length/, "split input should be enabled only after data is loaded");
});

test("column headers expose a dedicated drag path for reordering", () => {
  const start = html.indexOf("function renderHeader()");
  const end = html.indexOf("function renderGrid()", start);
  const source = html.slice(start, end);
  assert.match(source, /button\.draggable\s*=\s*true/, "header title button should be draggable for column reorder");
  assert.match(source, /button\.addEventListener\("mousedown",\s*\(event\) => event\.stopPropagation\(\)\)/, "header drag path should not start column range selection");
  assert.match(source, /button\.addEventListener\("dragstart"/, "header title button should start a drag operation");
  assert.match(source, /button\.addEventListener\("dragover"/, "header title button should accept dragged columns");
  assert.match(source, /button\.addEventListener\("drop"/, "header title button should handle column drops");
  assert.match(source, /dragColumn\(fromColumn,\s*col\)/, "dropping a header should reorder columns");
});

test("table supports keyboard navigation and range selection", () => {
  assert.match(html, /selectionAnchor/, "missing selection anchor state");
  assert.match(html, /selectionRange/, "missing selection range state");
  assert.match(html, /selectionDrag/, "missing drag selection state");
  assert.match(html, /function moveSelectionByKeyboard\(/, "missing keyboard navigation handler");
  assert.match(html, /function selectCellRange\(/, "missing rectangular cell selection");
  assert.match(html, /function selectRowRange\(/, "missing row range selection");
  assert.match(html, /function selectColumnRange\(/, "missing column range selection");
  assert.match(html, /function selectAllVisibleCells\(/, "missing visible-table select all");
  assert.match(html, /function startSelectionDrag\(/, "missing drag selection start");
  assert.match(html, /function updateSelectionDrag\(/, "missing drag selection update");
  assert.match(html, /function isCellInSelection\(/, "missing selection membership predicate");
  assert.match(html, /gridViewport\.addEventListener\("keydown",\s*handleGridKeyDown\)/, "grid should handle keyboard navigation");
  assert.match(html, /document\.addEventListener\("mouseup",\s*stopSelectionDrag\)/, "drag selection should end on document mouseup");
  assert.match(html, /button\.addEventListener\("click",\s*\(\) => selectColumnRange\(col,\s*col\)\)/, "column header click should select columns");
  assert.doesNotMatch(html, /button\.addEventListener\("click",\s*\(\) => toggleSort\(col\)\)/, "column header click should no longer sort");
});

test("selection copy is discoverable and supports keyboard shortcuts", () => {
  assert.match(html, /id="copyCellButton" disabled>复制选区<\/button>/, "detail copy button should be labeled for selection copy");
  assert.match(html, /function handleCopyShortcut\(/, "missing Ctrl/Cmd+C copy shortcut handler");
  assert.match(html, /function isEditableShortcutTarget\(/, "copy shortcut should ignore editable fields");
  assert.match(html, /copyText\(getSelectionText\(\)\)/, "copy shortcut should copy the active selection");
  assert.match(html, /document\.addEventListener\("keydown",\s*handleCopyShortcut\)/, "document should listen for copy shortcuts");
});

test("context menu closes when focus moves away", () => {
  assert.match(html, /document\.addEventListener\("pointerdown",\s*handleDocumentPointerDown\)/, "context menu should close on pointerdown outside");
  assert.match(html, /function handleDocumentPointerDown\(/, "missing shared pointerdown close handler");
  assert.match(html, /window\.addEventListener\("blur",\s*closeContextMenu\)/, "context menu should close when the window loses focus");
});

test("file import button is protected from wrapping in the compact header", () => {
  assert.match(html, /#chooseFileButton\s*{[\s\S]*?white-space:\s*nowrap/, "choose file button should not wrap");
  assert.match(html, /\.file-name-text\s*{[\s\S]*?text-overflow:\s*ellipsis/, "file name should ellipsize in the import area");
});

test("column overview uses a full-width toolbar row", () => {
  assert.match(html, /class="column-overview-row"[\s\S]*?id="columnOverview"/, "column overview should be placed in its own toolbar row");
  assert.match(html, /\.column-overview-row\s*{[\s\S]*?width:\s*100%/, "column overview row should span the toolbar width");
  assert.match(html, /\.column-overview\s*{[\s\S]*?width:\s*100%/, "column overview should fill its row");
  assert.match(html, /\.column-overview\s*{[\s\S]*?max-height:\s*68px/, "column overview should keep a fixed scrollable height");
  assert.doesNotMatch(html, /\.column-overview\s*{[\s\S]*?flex:\s*1 1 260px/, "column overview should not be squeezed into the metrics row");
});

test("large text thresholds match current product requirements", () => {
  assert.match(html, /const PREVIEW_LIMIT = 500;/, "cell preview threshold should be 500 chars");
  assert.match(html, /const DETAIL_CHUNK = 100000;/, "detail chunk should be 100000 chars");
});

test("narrow tables keep natural column width", () => {
  assert.doesNotMatch(
    html,
    /\.grid-canvas\s*{[\s\S]*?min-width:\s*100%/,
    "grid canvas should not force narrow tables to stretch to viewport width",
  );
  assert.match(html, /getTotalWidth\(\)/, "grid should still use computed total column width");
});

test("inline application script parses", () => {
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  const applicationScripts = scripts
    .filter((match) => !match[0].includes('type="text/plain"'))
    .map((match) => match[1].trim())
    .filter(Boolean);

  assert.ok(applicationScripts.length >= 1, "expected at least one application script");
  for (const script of applicationScripts) {
    assert.doesNotThrow(() => new Function(script));
  }
});
