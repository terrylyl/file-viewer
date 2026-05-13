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

test("users can delete only custom columns", () => {
  assert.match(html, /deleteCustomColumn/, "missing custom column deletion function");
  assert.match(html, /isCustomColumn/, "missing custom column predicate");
  assert.match(html, /deleteCustomColumnButton\.addEventListener\("click"/, "missing delete custom column action");
  assert.match(html, /deleteCustomColumnButton\.disabled\s*=\s*!isCustomColumn/, "delete should be disabled for source columns");
});

test("file import button is protected from wrapping in the compact header", () => {
  assert.match(html, /#chooseFileButton\s*{[\s\S]*?white-space:\s*nowrap/, "choose file button should not wrap");
  assert.match(html, /\.file-name-text\s*{[\s\S]*?text-overflow:\s*ellipsis/, "file name should ellipsize in the import area");
});

test("large text thresholds match current product requirements", () => {
  assert.match(html, /const PREVIEW_LIMIT = 500;/, "cell preview threshold should be 500 chars");
  assert.match(html, /const DETAIL_CHUNK = 100000;/, "detail chunk should be 100000 chars");
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
