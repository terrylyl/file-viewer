import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("index.html contains the required application regions", () => {
  for (const id of [
    "dropZone",
    "fileInput",
    "gridViewport",
    "headerRow",
    "rowLayer",
    "detailPanel",
    "searchInput",
    "exportCsvButton",
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

test("file import button is protected from wrapping in the compact header", () => {
  assert.match(html, /#chooseFileButton\s*{[\s\S]*?white-space:\s*nowrap/, "choose file button should not wrap");
  assert.match(html, /\.file-name-text\s*{[\s\S]*?text-overflow:\s*ellipsis/, "file name should ellipsize in the import area");
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
