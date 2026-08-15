import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const buildScript = readFileSync(new URL("../scripts/build-single-html.mjs", import.meta.url), "utf8");
const releaseScript = readFileSync(new URL("../scripts/create-release.mjs", import.meta.url), "utf8");
const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const sbom = JSON.parse(readFileSync(new URL("../sbom.cdx.json", import.meta.url), "utf8"));

test("app package version is 2.3.9", () => {
  assert.equal(packageJson.version, "2.3.9");
});

test("release governance artifacts stay aligned with the baseline", () => {
  for (const file of ["LICENSE", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md", "SECURITY.md", "sbom.cdx.json"]) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `missing release governance file: ${file}`);
  }
  assert.match(readFileSync(new URL("../LICENSE", import.meta.url), "utf8"), /^MIT License/m, "the project should use the MIT License");
  assert.equal(sbom.metadata.component.version, packageJson.version, "SBOM application version should match package metadata");
  assert.equal(sbom.components[0].name, "SheetJS Community Edition", "SBOM should record the optional Excel runtime dependency");
  assert.match(releaseScript, /const releaseFiles = \["index\.html"\]/, "release archive should contain only the final application artifact");
  assert.doesNotMatch(releaseScript, /release-manifest\.json/, "single-artifact releases should not add package metadata inside the archive");
  assert.match(releaseScript, /const checksumPath = `\$\{archivePath\}\.sha256`/, "packaging should create a release checksum path");
  assert.match(releaseScript, /writeFile\(checksumPath/, "packaging should write the release checksum");
  assert.equal(packageJson.scripts.package, "npm run build && node scripts/create-release.mjs", "package script should use the release builder");
  assert.match(ciWorkflow, /npm test/, "CI should run the full test suite");
  assert.match(ciWorkflow, /git diff --exit-code -- index\.html/, "CI should verify the generated artifact is current");
  assert.match(ciWorkflow, /gh release create/, "tag releases should publish the verified archive");
});

test("index.html contains the required application regions", () => {
  for (const id of [
    "dropZone",
    "fileInput",
    "clipboardImportButton",
    "emptyChooseFileButton",
    "emptyClipboardImportButton",
    "mobileToolsButton",
    "clipboardImportPopover",
    "clipboardFirstRowHeaderInput",
    "gridViewport",
    "headerRow",
    "rowLayer",
    "detailPanel",
    "detailResizeHandle",
    "searchInput",
    "exportCsvButton",
    "exportFormatSelect",
    "exportSplitCountInput",
    "csv-worker-source",
    "columnFilterPopover",
    "columnFilterSearchInput",
    "columnConditionOperatorSelect",
    "columnConditionValueInput",
    "columnConditionValueLabelText",
    "columnConditionHint",
    "columnFilterValues",
    "columnOverview",
    "clearAllFiltersButton",
    "wrapCellsInput",
    "filteredRowStats",
    "activeFilterBar",
    "activeFilterChips",
    "selectionToolbar",
    "selectionToolbarStatus",
    "exportMenuButton",
    "exportPopover",
    "exportSummary",
    "commandPaletteBackdrop",
    "commandPaletteInput",
    "commandPaletteList",
    "shortcutHelpBackdrop",
    "toastRegion",
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

test("Excel cell metadata rendering stays available", () => {
  assert.match(html, /extractExcelCellMeta/, "missing Excel cell metadata extraction");
  assert.match(html, /normalizeExcelColor/, "missing Excel color normalizer");
  assert.match(html, /applyCellMetaStyle/, "missing cell style application");
  assert.match(html, /renderCellDisplayContent/, "missing styled cell renderer");
});

test("Excel import defaults to safe low-memory SheetJS options", () => {
  assert.match(html, /function getExcelReadOptions\(\)/, "missing Excel read options helper");
  assert.match(html, /cellStyles:\s*false/, "Excel import should not request styles by default");
  assert.match(html, /cellHTML:\s*false/, "Excel import should not request rich text HTML by default");
  assert.match(html, /sheetJs\.read\(message\.buffer,\s*getExcelReadOptions\(\)\)/, "Excel parser should use guarded read options in its Worker");
  assert.doesNotMatch(html, /sheetJs\.read\(message\.buffer,\s*\{[^}]*cellStyles:\s*true[^}]*\}/s, "Excel parser should not inline style-heavy options");
  assert.doesNotMatch(html, /sheetJs\.read\(message\.buffer,\s*\{[^}]*cellHTML:\s*true[^}]*\}/s, "Excel parser should not inline HTML-heavy options");
});

test("Excel import has size and metadata scan guards", () => {
  assert.match(html, /EXCEL_SAFE_READ_MAX_BYTES/, "missing Excel file size guard constant");
  assert.match(html, /assertExcelFileWithinSafeLimit\(file\)/, "Excel parser should check file size before reading");
  assert.match(html, /EXCEL_SHARED_STRINGS_MAX_BYTES/, "missing sharedStrings.xml size guard constant");
  assert.match(html, /readXlsxZipEntryUncompressedSize/, "Excel parser should inspect XLSX zip metadata before SheetJS");
  assert.match(html, /assertExcelSharedStringsWithinSafeLimit\(file\)/, "Excel parser should guard huge sharedStrings.xml before parsing");
  assert.match(html, /EXCEL_CELL_META_SCAN_MAX_CELLS/, "missing Excel metadata scan guard constant");
  assert.match(html, /collectExcelCellMetaSafely/, "Excel metadata should be collected through a guard");
});

test("oversized XLSX files can be converted to CSV without SheetJS workbook loading", () => {
  for (const id of ["xlsxConvertActions", "xlsxConvertSheetSelect", "xlsxConvertCsvButton", "xlsxConvertStatus"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /xlsxConversion:\s*null/, "missing XLSX conversion state");
  assert.match(html, /function buildXlsxZipIndex\(/, "missing XLSX zip index reader");
  assert.match(html, /function inflateXlsxEntryText\(/, "missing XLSX zip entry inflater");
  assert.match(html, /new DecompressionStream\("deflate-raw"\)/, "XLSX conversion should inflate raw deflate entries");
  assert.match(html, /function parseXlsxWorkbookSheets\(/, "missing workbook sheet parser");
  assert.match(html, /function parseXlsxSharedStrings\(/, "missing sharedStrings parser");
  assert.match(html, /function convertXlsxSheetXmlToCsvParts\(/, "missing sheet XML to CSV converter");
  assert.match(html, /function offerXlsxCsvConversion\(/, "missing conversion offer after Excel parse failure");
  assert.match(html, /await offerXlsxCsvConversion\(file,\s*loadToken\)/, "Excel parse errors should offer XLSX to CSV conversion");
  assert.match(html, /xlsxConvertCsvButton\.addEventListener\("click",\s*convertSelectedXlsxSheetToCsv\)/, "conversion button should export selected sheet");
  const converterStart = html.indexOf("async function convertSelectedXlsxSheetToCsv()");
  const converterEnd = html.indexOf("function normalizeTextParts", converterStart);
  assert.ok(converterStart >= 0 && converterEnd > converterStart, "should isolate the XLSX conversion function body");
  const converterSource = html.slice(converterStart, converterEnd);
  assert.doesNotMatch(converterSource, /XLSX\.read/, "XLSX to CSV conversion should not load a SheetJS workbook");
  assert.match(converterSource, /saveTextFile\(filename,\s*parts\)/, "conversion should save CSV parts directly");
});

test("Excel workbooks expose sheet selection", () => {
  assert.match(html, /id="sheetSelect"/, "missing Excel sheet selector");
  assert.match(html, /updateSheetSelect/, "missing sheet selector renderer");
  assert.match(html, /loadExcelSheet/, "missing sheet loading function");
  assert.match(html, /SheetNames/, "Excel parser should inspect workbook sheets");
  assert.match(html, /sheetSelect\.addEventListener\("change"/, "sheet selector should respond to changes");
});

test("JSONL files are parsed as JSON Lines tables", () => {
  assert.match(html, /accept="\.csv,\.tsv,\.txt,\.jsonl,\.xlsx,\.xls"/, "file picker should accept .jsonl files");
  assert.match(html, /function parseJsonlText\(/, "worker should expose JSONL text parsing");
  assert.match(html, /parseJsonlFile\(file\)/, "file loading should route .jsonl files to JSONL parsing");
  assert.match(html, /kind:\s*"parse-jsonl"/, "JSONL parser should use the worker path");
  assert.match(html, /application\/x-ndjson/, "native picker should advertise JSONL support");
  assert.match(html, /JSONL 解析失败/, "JSONL parse errors should be visible to users");
});

test(".tsv imports take their delimiter from the extension, .csv does not", () => {
  assert.match(html, /function delimiterFromFileName\(/, "missing extension based delimiter hint");
  assert.match(html, /\/\\\.tsv\$\/i\.test/, "only .tsv should be pinned to Tab");
  assert.doesNotMatch(html, /\/\\\.csv\$\/i\.test\(name/, "「.csv 强制逗号」会打错用分号导出的 CSV");
  const csvImport = html.slice(html.indexOf('kind: "parse-csv"'));
  assert.match(
    csvImport.slice(0, 400),
    /delimiter: resolveImportDelimiter\(file\)/,
    "普通 CSV 路径应带上解析出来的分隔符",
  );
  const largeImport = html.slice(html.indexOf('kind: "load-large-file"'));
  assert.match(
    largeImport.slice(0, 400),
    /delimiter: resolveImportDelimiter\(file\)/,
    "大文件路径应带上解析出来的分隔符",
  );
});

test("严格 CSV 模式可以从界面开启并贯通两条解析路径", () => {
  assert.match(html, /id="strictCsvInput"/, "missing strict CSV control");
  assert.match(html, /strictCsvInput: document\.getElementById\("strictCsvInput"\)/, "strict control should be in els");
  assert.match(
    html,
    /els\.strictCsvInput\.addEventListener\("change", reimportWithOverrides\)/,
    "切换严格模式应重新解析当前文件",
  );
  assert.match(html, /strict: resolveImportStrict\(\)/, "两条导入路径都要带上严格开关");
  assert.match(html, /const tolerant = !options\.strict;/, "解析器应支持 strict 选项");
  assert.match(html, /strict: Boolean\(message\.strict\)/, "普通路径 worker 应接受 strict");
  assert.match(html, /strict: Boolean\(options\.strict\)/, "大文件路径应接受 strict");
});

test("delimiter and header row can be overridden by hand", () => {
  assert.match(html, /id="delimiterSelect"/, "missing manual delimiter control");
  assert.match(html, /id="headerRowInput"/, "missing manual header row control");
  assert.match(html, /delimiterSelect: document\.getElementById\("delimiterSelect"\)/, "delimiter control should be in els");
  assert.match(html, /headerRowInput: document\.getElementById\("headerRowInput"\)/, "header row control should be in els");
  assert.match(
    html,
    /els\.delimiterSelect\.addEventListener\("change", reimportWithOverrides\)/,
    "改分隔符应重新解析当前文件",
  );
  assert.match(
    html,
    /els\.headerRowInput\.addEventListener\("change", reimportWithOverrides\)/,
    "改表头行应重新解析当前文件",
  );
  assert.match(html, /function reimportWithOverrides\(/, "missing reimport entry point");
  assert.match(html, /confirmDatasetReplacement\(\)/, "重新解析会丢弃编辑，必须先确认");
  assert.match(html, /resetImportOverrides\(\);/, "换文件必须清掉上一份文件的手动设置");
  assert.match(html, /headerRow: resolveImportHeaderRow\(\)/, "两条导入路径都要带上手动表头行");
  assert.match(html, /message\.headerRow > 0 \? message\.headerRow - 1 : -1/, "worker 应把 1 起的行号转成下标");
  assert.match(html, /options\.headerRow > 0/, "大文件路径应接受手动表头行");
});

test("delimiter misdetection is surfaced instead of failing silently", () => {
  assert.match(html, /function findCsvDelimiterAlternative\(/, "missing low confidence delimiter check");
  assert.match(html, /分隔符可能判断有误/, "整表塌成一列时必须给出告警");
  assert.match(html, /function sampleCsvRecords\(/, "delimiter sampling should be shared");
  assert.match(html, /options\.truncated/, "截断样本不能调用 finish()");
});

test("Excel sheet conversion avoids spreading large matrices", () => {
  assert.match(html, /getMatrixColumnCount/, "missing iterative matrix column counter");
  assert.doesNotMatch(html, /Math\.max\(\s*\.\.\.matrix\.map/, "large Excel matrices should not be spread into Math.max");
});

test("Excel import trims inflated blank worksheet ranges before matrix conversion", () => {
  assert.match(html, /function trimExcelSheetRefToContent\(/, "missing Excel worksheet range trim helper");
  assert.match(html, /trimExcelSheetRefToContent\(sheet,\s*sheetJs\)/, "Excel sheets should shrink inflated !ref ranges");
  assert.match(
    html,
    /trimExcelMatrixToContent\(sheetJs\.utils\.sheet_to_json\(sheet,\s*\{\s*header:\s*1,\s*raw:\s*false,\s*defval:\s*""\s*\}\)\)/,
    "Excel matrix conversion should trim trailing empty rows and columns",
  );
});

test("cell URLs are rendered as clickable links", () => {
  assert.match(html, /detectCellLinks/, "missing URL detector");
  assert.match(html, /appendLinkedText/, "missing linked text renderer");
  assert.match(html, /target = "_blank"/, "links should open in a new tab");
  assert.match(html, /rel = "noopener noreferrer"/, "links should use safe rel attributes");
});

test("CSV export protects spreadsheet apps from formula injection", () => {
  assert.match(html, /function escapeSpreadsheetFormula\(/, "missing spreadsheet formula guard");
  assert.match(html, /const text = escapeSpreadsheetFormula\(value\)/, "CSV escaping should guard formulas before syntax escaping");
  assert.match(html, /\^\[=\+\\-@\]/, "formula guard should detect common spreadsheet formula prefixes");
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

test("users can add a constant-value derived column", () => {
  for (const id of ["constantColumnValueLabel", "constantColumnValueInput"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /<option value="constant">用户配置内容<\/option>/, "missing constant-value column mode option");
  assert.match(html, /newColumnModeSelect\.value === "constant"/, "constant mode should toggle its input");
  assert.match(html, /constantValue:\s*els\.constantColumnValueInput\.value/, "constant value should be passed into addDerivedColumn");
  assert.match(html, /function addDerivedColumn\(\{ name, mode, sourceColumnIndex, constantValue \}\)/, "derived column creator should accept constantValue");
  assert.match(html, /const sharedValue = String\(constantValue \?\? ""\)/, "constant value should be normalized once");
  assert.match(html, /mode === "constant"[\s\S]*?row\[columnIndex\] = sharedValue/, "constant mode should fill every row with the same configured value");
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

test("concatenate column selects stay stable during fast pointer use", () => {
  assert.doesNotMatch(html, /row\.draggable\s*=\s*true/, "the whole concatenate row must not start a drag from its form controls");
  assert.match(html, /handle\.draggable\s*=\s*true/, "only the dedicated handle should start concatenate row dragging");
  assert.match(
    html,
    /select\.addEventListener\("change",[\s\S]*?manualInput\.value\s*=\s*""[\s\S]*?aliasInput\.value\s*=\s*item\.alias/,
    "changing a source column should update the existing row controls without rerendering the open select",
  );
});

test("responsive overlays keep touch controls and column filters usable", () => {
  assert.match(html, /id="columnFilterBackdrop"/, "missing mobile column-filter backdrop");
  assert.match(html, /id="closeColumnFilterButton"/, "missing explicit column-filter close action");
  assert.match(html, /@media \(max-width: 980px\)[\s\S]*?--control-height:\s*44px/, "narrow controls should use touch-sized heights");
  assert.match(html, /\.selection-toolbar button\s*\{[\s\S]*?flex:\s*0 0 auto[\s\S]*?white-space:\s*nowrap/, "selection actions should not shrink or wrap");
});

test("modal surfaces trap focus and return it to their trigger", () => {
  assert.match(html, /function openManagedDialog\(/, "missing managed dialog opener");
  assert.match(html, /els\.appRoot\.inert\s*=\s*true/, "opening a modal surface should disable the workspace");
  assert.match(html, /function trapManagedDialogFocus\(/, "missing modal focus loop");
  assert.match(html, /returnFocus\.focus\(\)/, "closing a modal surface should restore trigger focus");
});

test("interaction motion stays transform-based and exits cleanly", () => {
  assert.match(html, /progressBar\.style\.transform\s*=\s*`scaleX/, "progress should animate with a transform");
  assert.match(html, /toast\.classList\.add\("dismissing"\)/, "toasts should animate before removal");
  assert.match(html, /activeToasts[\s\S]*?\.filter\(\(item\) => !item\.classList\.contains\("dismissing"\)\)/, "toast capacity should ignore items already leaving");
  assert.doesNotMatch(html, /oldest\.isConnected\) oldest\.remove\(\)/, "overflowing toasts should not skip their exit transition");
  assert.match(html, /document\.startViewTransition/, "desktop detail panel changes should use a compositor-friendly layout transition when supported");
  assert.match(html, /\.shortcut-help-backdrop\s*\{[\s\S]*?transition:[\s\S]*?display\s+160ms\s+allow-discrete/, "shortcut help should animate independently from the command palette");
  assert.match(html, /@media \(min-width: 521px\)[\s\S]*?\.column-filter-backdrop[\s\S]*?display:\s*none\s*!important/, "desktop column filters should not dim the workspace");
  assert.match(html, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.detail-resize-handle:hover::after/, "hover-only resize feedback should require a precise pointer");
  assert.doesNotMatch(html, /@keyframes toast-in/, "toast entry should remain interruptible");
});

test("keyboard-first actions stay immediate", () => {
  assert.match(html, /\.command-item\s*\{[\s\S]*?transition:\s*none/, "command palette navigation should not animate selection changes");
  assert.match(html, /run:\s*\(\)\s*=>\s*toggleDetailPanel\(\{\s*animate:\s*false\s*\}\)/, "command palette detail toggles should be immediate");
  assert.match(html, /run:\s*\(\)\s*=>\s*openShortcutHelp\(\{\s*animate:\s*false\s*\}\)/, "command palette help should open immediately");
  assert.match(html, /openShortcutHelp\(\{\s*animate:\s*false\s*\}\)/, "the question-mark shortcut should open help immediately");
  assert.match(html, /\.shortcut-help-backdrop\.no-motion[\s\S]*?transition:\s*none/, "keyboard-opened shortcut help should suppress transitions");
});

test("toast lifetime pauses while users cannot act on it", () => {
  assert.match(html, /document\.addEventListener\("visibilitychange",\s*syncTimer\)/, "toast timers should react to tab visibility");
  assert.match(html, /toast\.addEventListener\("pointerenter",\s*pauseForPointer\)/, "toast timers should pause on pointer hover");
  assert.match(html, /toast\.addEventListener\("focusin",\s*pauseForFocus\)/, "toast timers should pause while an action has focus");
  assert.match(html, /remaining\s*=\s*Math\.max\(0,\s*remaining\s*-/, "toast timers should retain their remaining lifetime");
});

test("resize gestures use captured pointer events and frame-coalesced updates", () => {
  assert.match(html, /setPointerCapture\(event\.pointerId\)/, "resize handles should capture their active pointer");
  assert.match(html, /document\.addEventListener\("pointermove",\s*onResizeMove\)/, "resizing should follow pointer events");
  assert.match(html, /document\.addEventListener\("pointercancel",\s*stopResize\)/, "cancelled resize gestures should clean up state");
  assert.match(html, /requestAnimationFrame\(applyPendingResize\)/, "resize updates should be coalesced into animation frames");
  assert.match(html, /@property --detail-width[\s\S]*?inherits:\s*false/, "detail width should not inherit through the workspace tree");
  assert.match(html, /@property --modal-source-width[\s\S]*?inherits:\s*false/, "modal split width should not inherit through modal descendants");
});

test("column resizing keeps the header width aligned with the row canvas", () => {
  const start = html.indexOf("function applyPendingResize()");
  const end = html.indexOf("function onResizeMove", start);
  const source = html.slice(start, end);
  assert.match(source, /headerCell\.style\.flex\s*=\s*`0 0 \$\{state\.columnWidths\[state\.resize\.column\]\}px`/, "column resizing should update the active header cell width without rebuilding it");
  assert.match(source, /els\.headerRow\.style\.width\s*=\s*`\$\{getTotalWidth\(\)\}px`/, "column resizing should update the header container total width");
  assert.match(source, /renderRowsOnly\(\)/, "column resizing should continue using the row-only render path");
});

test("low-frequency workspace states use scoped desktop motion", () => {
  assert.match(html, /function beginWorkspaceReveal\(/, "first successful data load should have a dedicated reveal path");
  assert.match(html, /workspace-revealing/, "workspace reveal should use an explicit transient state");
  assert.match(html, /workspace-reveal-active/, "workspace reveal should separate initial and settled frames");
  assert.match(html, /selectionToolbar\.classList\.toggle\("visible",\s*showToolbar\)/, "selection toolbar visibility should use an animatable class");
  assert.match(html, /activeFilterBar\.classList\.toggle\("visible",\s*hasActiveItems\)/, "active filter bar visibility should use an animatable class");
  assert.match(html, /@media \(min-width:\s*981px\)[\s\S]*?\.selection-toolbar\.visible[\s\S]*?\.active-filter-bar\.visible/, "desktop transient bars should define visible motion states");
});

test("concatenate rows animate add, removal, and reordering without rerendering selects on change", () => {
  assert.match(html, /function captureConcatenateRowRects\(/, "concatenate row motion should capture previous positions");
  assert.match(html, /function animateConcatenateRowLayout\(/, "concatenate row motion should apply a FLIP transition");
  assert.match(html, /row\.dataset\.motionId\s*=\s*motionId/, "concatenate rows should expose stable motion identities");
  assert.match(html, /classList\.add\("removing"\)/, "removed concatenate rows should animate before deletion");
  assert.match(html, /classList\.add\("entering"\)/, "new concatenate rows should animate from a restrained entry state");
  assert.match(html, /\.concatenate-row\.entering[\s\S]*?\.concatenate-row\.removing/, "concatenate row CSS should define entry and exit states");
});

test("drag feedback and column settings disclosure use restrained motion", () => {
  assert.match(html, /\.drop-zone::after[\s\S]*?opacity:\s*0[\s\S]*?transform:\s*scale\(0\.985\)/, "drop target should expose an overlay entry state");
  assert.match(html, /\.drop-zone\.dragover::after[\s\S]*?opacity:\s*1[\s\S]*?transform:\s*scale\(1\)/, "drag target should visibly acknowledge an active drop");
  assert.match(html, /class="filter-column-settings-content"/, "column settings should wrap disclosure content for motion");
  assert.match(html, /\.filter-column-settings\[open\]\s*>\s*\.filter-column-settings-content[\s\S]*?opacity:\s*1/, "opened column settings should reveal their content");
  assert.match(html, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?workspace-revealing[\s\S]*?concatenate-row/, "new motion should have a reduced-motion treatment");
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
  assert.match(html, /type:\s*"cell-batch-value"/, "paste should be recorded as one undoable batch");
  assert.match(html, /setCellValue\(rowIndex,\s*columnIndex,\s*nextValue,\s*\{[\s\S]*?recordHistory:\s*false/, "paste should use the normal cell writer without per-cell history");
  assert.match(html, /refreshAfterCellValueBatchChange\(changes\)/, "paste should refresh edited state and issues after the batch");
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
  assert.match(html, /function tokenizeListCellValue\(/, "missing list-token parser for advanced column filters");
  assert.match(html, /value="list-token-count-gte"/, "missing list-token count condition");
  assert.match(html, /value="distinct-list-token-count-gte"/, "missing distinct list-token count condition");
  assert.match(html, /`a,b,c`/, "list-token condition hint should mention plain delimited lists");
  assert.match(html, /无分隔符文本按单个元素处理/, "list-token condition hint should explain single plain values");
  assert.match(html, /type === "contains" \|\| type === "not-contains" \|\| type === "regex"/, "missing text and regex column conditions");
  assert.match(html, /\["number-gt", "number-gte", "number-lt", "number-lte", "number-eq"\]/, "missing numeric column conditions");
  assert.match(html, /condition:\s*filter\.condition \? \{ \.\.\.filter\.condition \} : null/, "advanced column filters should be sent to the query worker");
  assert.match(html, /mode:\s*"exclude"/, "filter model should support exclusions for mostly-selected large columns");
  assert.match(html, /const activeColumnFilters = getActiveColumnFilters\(\)/, "row filtering should precompute active filters once");
  assert.match(html, /rowPassesColumnFilters\(row,\s*activeColumnFilters\)/, "row filtering should reuse precomputed filters");
  assert.match(html, /const debouncedColumnFilterSearch = debounce\(/, "column filter search should be debounced");
  assert.match(html, /columnValueTokens:\s*new Map\(\)/, "unique-value requests should track tokens per column");
  assert.match(html, /columnValueTokenCounter:\s*0/, "unique-value requests should use a monotonic counter");
  assert.match(html, /state\.columnValueTokens\.set\(cacheKey,\s*token\)/, "unique-value requests should store each column token");
  assert.match(html, /state\.columnValueTokens\.delete\(cacheKey\)/, "column cache invalidation should clear stale column tokens");
  assert.doesNotMatch(html, /columnValueToken:\s*0/, "unique-value requests should not rely on one global token");
  assert.doesNotMatch(
    html,
    /return new Set\(getColumnUniqueValues\(columnIndex\)\.map/,
    "default selected filter state should not allocate a Set for every unique value",
  );
});

test("advanced column filter controls fit inside the popover", () => {
  assert.match(html, /id="columnConditionOperatorSelect"/, "missing condition operator select");
  assert.match(html, /id="columnConditionValueInput"/, "missing condition value input");
  assert.match(html, /id="columnConditionValueLabelText">参数<\/span>/, "condition value input should have a visible label");
  assert.match(html, /function getColumnFilterConditionValueLabel\(/, "condition value label should adapt to the selected operator");
  assert.match(html, /if \(type === "regex"\) return "正则表达式"/, "regex condition should clearly label its input");
  assert.match(html, /if \(type === "regex"\) return "例如 \^AB-\\\\d\+\$"/, "regex condition should show an example placeholder");
  assert.match(html, /function positionColumnFilterPopover\(/, "filter popover should be positioned from its rendered size");
  assert.match(html, /positionColumnFilterPopover\(rect\)/, "filter popover should be repositioned after rendering values");
  assert.match(html, /\.filter-popover\s*{[\s\S]*?width:\s*min\(390px,\s*calc\(100vw - 20px\)\)/, "filter popover should clamp to the viewport");
  assert.match(html, /\.filter-popover\s*{[\s\S]*?height:\s*min\(720px,\s*calc\(100vh - 16px\)\)/, "filter popover should reserve enough height for value scanning");
  assert.match(html, /\.filter-popover\s*{[\s\S]*?max-height:\s*calc\(100vh - 16px\)/, "filter popover should still fit inside the viewport");
  assert.match(html, /\.filter-popover\s*{[\s\S]*?overflow:\s*hidden/, "filter popover should clip content to its frame");
  assert.match(html, /\.filter-popover\.open\s*{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/, "filter popover should lay out content vertically");
  assert.match(html, /\.filter-condition-controls\s*{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/, "condition controls should use a compact two-column layout");
  assert.match(html, /\.filter-condition-field\s*{[\s\S]*?display:\s*grid[\s\S]*?min-width:\s*0/, "condition fields should use full-width rows");
  assert.match(html, /\.filter-condition-hint\s*{[\s\S]*?overflow-wrap:\s*anywhere/, "condition hint should wrap long examples");
  assert.match(html, /\.filter-values\s*{[\s\S]*?flex:\s*1 1 auto[\s\S]*?overflow:\s*auto/, "filter value list should scroll inside the popover");
  assert.match(html, /\.filter-values label\s*{[\s\S]*?grid-template-columns:\s*22px\s*minmax\(0,\s*1fr\)\s*auto/, "filter value rows should keep checkboxes inside the list");
  assert.match(html, /function getConditionMatchedValues\(/, "value list should be filterable by advanced conditions");
  assert.match(html, /const conditionMatchedValues = getConditionMatchedValues\(columnIndex,\s*allValues\)/, "condition-matched value totals should be precomputed");
  assert.match(html, /const visibleValues = getConditionMatchedValues\(columnIndex,\s*getMenuFilteredValues\(allValues\)\)/, "condition misses should be hidden from the value list");
  assert.match(html, /updateColumnFilterValues\(columnIndex,\s*getConditionMatchedValues\(columnIndex,\s*getMenuFilteredValues\(allValues\)\)/, "bulk value actions should target only displayed values");
  assert.match(html, /if \(String\(rawValue \?\? ""\)\.trim\(\) === ""\) return null/, "empty list-count thresholds should not restore the default");
  assert.match(html, /count >= 0 \? \{ type,\s*value:\s*String\(Math\.floor\(count\)\) \} : null/, "zero list-count thresholds should stay valid");
  assert.match(html, /renderColumnFilterValues\(\{ syncControls: !options\.keepDraftControls \}\)/, "empty parameter edits should preserve draft controls");
  assert.match(html, /keepDraftControls: columnFilterConditionNeedsValue\(type\) && !els\.columnConditionValueInput\.value\.trim\(\)/, "clearing condition parameters should not refill the input");
});

test("scrolling refreshes rows without rebuilding the header", () => {
  assert.match(html, /headerDirty:\s*true/, "missing header dirty render flag");
  assert.match(html, /function renderRowsOnly\(\)/, "missing row-only render scheduler");
  assert.match(html, /function queueGridRender\(\)/, "missing shared grid render queue");
  assert.match(html, /if \(state\.headerDirty\) \{[\s\S]*?renderHeader\(\)/, "header should render only when marked dirty");
  assert.match(
    html,
    /gridViewport\.addEventListener\("scroll",\s*renderRowsOnly,\s*\{\s*passive:\s*true\s*\}\)/,
    "scrolling should use the row-only render path",
  );
  assert.doesNotMatch(
    html,
    /gridViewport\.addEventListener\("scroll",\s*renderGrid/,
    "scrolling should not trigger full grid/header rerenders",
  );
});

test("table query recomputation can run in a dedicated worker", () => {
  assert.match(html, /id="query-worker-source"/, "missing query worker source");
  assert.match(html, /function createQueryWorker\(\)/, "missing query worker factory");
  assert.match(html, /function seedQueryWorker\(\)/, "missing query worker dataset seeding");
  assert.match(html, /function serializeActiveColumnFilters\(\)/, "missing serializable filter payload builder");
  assert.match(html, /function runQueryInWorker\(request\)/, "missing worker query dispatcher");
  assert.match(html, /function applyQueryResult\(result\)/, "missing shared query result applier");
  assert.match(html, /if \(runQueryInWorker\(request\)\) return;/, "recomputeView should prefer the worker path");
  assert.match(html, /function computeViewSync\(request = getViewQueryRequest\(\)\)/, "missing main-thread query fallback");
  assert.match(html, /patchQueryWorkerCells\(changes\)/, "batch cell edits should patch worker data");
  assert.match(html, /patchQueryWorkerCells\(\[\{ rowIndex, columnIndex \}\]\)/, "single cell edits should patch worker data");
});

test("table rows are stored behind a chunked array facade", () => {
  assert.match(html, /ROW_CHUNK_SIZE\s*=\s*5000/, "missing row chunk size");
  assert.match(html, /rowChunks:\s*\[\]/, "missing row chunk state");
  assert.match(html, /function createRowChunks\(/, "missing row chunk builder");
  assert.match(html, /function createChunkedRows\(/, "missing chunked rows facade");
  assert.match(html, /state\.rows = createChunkedRows\(result\.rows \|\| \[\]\)/, "datasets should use chunked row storage");
  assert.match(html, /state\.rowChunks = state\.rows\.__chunks/, "row chunks should be retained for worker transfer");
  assert.match(html, /chunks:\s*state\.rowChunks/, "query worker should receive row chunks");
});

test("large text files use a streamed offset index over the original File", () => {
  assert.match(html, /LARGE_TEXT_FILE_THRESHOLD\s*=\s*24 \* 1024 \* 1024/, "rich-text CSVs should switch to the streamed path at 24 MiB");
  assert.match(html, /LARGE_TEXT_FILE_MAX_BYTES\s*=\s*500 \* 1024 \* 1024/, "large-file capacity should be 500 MiB");
  assert.match(html, /function createLargeDataWorker\(\)/, "missing large data worker factory");
  assert.match(html, /id="large-data-worker-source"/, "large data worker must be embedded in the single HTML build");
  assert.match(html, /file\.stream\(\)\.getReader\(\)/, "large data parser should stream the input file");
  assert.match(html, /rowCellOffsets\s*=\s*new Uint32Array/, "large data path should keep compact row/cell offsets");
  assert.match(html, /sourceFile\.slice\(start, end\)\.arrayBuffer\(\)/, "large data path should read exact ranges from the original File");
  assert.doesNotMatch(html, /navigator\.storage\?\.getDirectory/, "large data path should not require OPFS");
  assert.match(html, /function requestLargePreviews\(/, "main thread should request bounded row previews");
  assert.match(html, /function requestLargeCell\(/, "main thread should request a full cell only on demand");
  assert.match(html, /function requestLargeRows\(/, "main thread should request paged rows on demand");
  assert.match(html, /LARGE_PREVIEW_CACHE_MAX_BYTES\s*=\s*32 \* 1024 \* 1024/, "preview cache should have a byte limit");
  assert.match(html, /LARGE_CELL_CACHE_MAX_BYTES\s*=\s*64 \* 1024 \* 1024/, "full-cell cache should have a byte limit");
  assert.match(html, /const row = getDisplayRow\(rowIndex\)/, "grid should render bounded previews instead of complete rows");
  assert.match(html, /cancelLoadButton/, "large-file loading should offer cancellation");
  assert.match(html, /LARGE_LOAD_STALL_NOTICE_MS\s*=\s*15000/, "large-file loading should have a progress watchdog");
  assert.match(html, /LARGE_LOAD_STALL_FAILURE_MS\s*=\s*45000/, "a silent large-file worker should eventually fail instead of hanging forever");
});

test("large data worker script parses", () => {
  const match = html.match(/<script id="large-data-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed large-data-worker-source");
  assert.doesNotThrow(() => new Function(match[1]));
});

test("query worker script parses", () => {
  const match = html.match(/<script id="query-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed query-worker-source");
  assert.doesNotThrow(() => new Function(match[1]));
});

test("column unique values can be computed asynchronously in the worker", () => {
  assert.match(html, /COLUMN_UNIQUE_WORKER_THRESHOLD\s*=\s*10000/, "missing async unique value threshold");
  assert.match(html, /columnValuePending:\s*new Set\(\)/, "missing async column-value pending state");
  assert.match(html, /function requestColumnUniqueValues\(/, "missing async unique-value request helper");
  assert.match(html, /kind:\s*"unique-values"/, "main thread should request worker unique values");
  assert.match(html, /type:\s*"unique-values-complete"/, "query worker should return unique values");
  assert.match(html, /computeUniqueValues\(message\.columnIndex\)/, "query worker should compute unique values by column");
  assert.match(html, /isColumnValuePending\(columnIndex\)/, "filter menu should recognize pending unique values");
  assert.match(html, /正在统计本列值/, "filter menu should show async unique-value loading state");
});

test("visible cell rendering uses a bounded cache", () => {
  assert.match(html, /MAX_CELL_RENDER_CACHE\s*=\s*3000/, "missing bounded cell render cache size");
  assert.match(html, /cellVersions:\s*new Map\(\)/, "missing per-cell render version state");
  assert.match(html, /cellRenderCache:\s*new Map\(\)/, "missing cell render cache state");
  assert.match(html, /function getCellRenderCacheKey\(/, "missing cell render cache key builder");
  assert.match(html, /function appendCachedCellRender\(/, "missing cache read path");
  assert.match(html, /function rememberCellRender\(/, "missing cache write path");
  assert.match(html, /touchCellVersion\(rowIndex,\s*columnIndex\)/, "cell edits should advance render versions");
  assert.match(html, /renderOptions\.cacheKey = getCellRenderCacheKey\(/, "row rendering should provide cache keys");
  assert.match(html, /appendCachedCellRender\(container,\s*options\.cacheKey,\s*meta\)/, "cell renderer should use cached nodes");
});

test("large-file viewport previews are deduplicated and repaint rows only", () => {
  assert.match(html, /pendingPreviewRows:\s*new Set\(\)/, "missing in-flight preview row tracking");
  assert.match(html, /!state\.largeData\.pendingPreviewRows\.has\(rowIndex\)/, "duplicate preview rows should be skipped");
  assert.match(html, /pending\?\.indices\.forEach\(\(rowIndex\)\s*=>\s*state\.largeData\.pendingPreviewRows\.delete\(rowIndex\)\)/, "completed preview rows should leave the pending set");
  assert.match(html, /requestLargePreviews\(rowIndices\)\.then\(\(rows\)\s*=>\s*\{[\s\S]*?renderRowsOnly\(\)/, "preview completion should repaint rows without rebuilding the header");
});

test("Excel parsing and export stay inside the dedicated worker", () => {
  assert.match(html, /id="excel-worker-source"/, "missing Excel worker source");
  assert.match(html, /function createExcelWorker\(\)/, "missing Excel worker factory");
  assert.match(html, /function startExcelWorkerParse\(/, "missing Excel worker launcher");
  assert.match(html, /kind:\s*"load-workbook"/, "Excel worker should load workbooks");
  assert.match(html, /kind:\s*"load-sheet"/, "Excel worker should load sheets on demand");
  assert.match(html, /kind:\s*"export-xlsx"/, "Excel worker should create XLSX exports");
  assert.match(html, /function exportXlsxInWorker\(/, "main thread should delegate XLSX export to the worker");
  assert.doesNotMatch(html, /function parseExcelFileOnMainThread\(/, "SheetJS must not execute on the main thread");
  assert.doesNotMatch(html, /https:\/\/cdn\.jsdelivr\.net/, "Excel support must not fetch runtime code from a CDN");
  assert.doesNotMatch(html, /importScripts\(/, "embedded SheetJS must not use runtime script loading");
  assert.match(html, /state\.excelWorker\.terminate\(\)/, "Excel workbook reset should terminate the worker");
});

test("Excel worker script parses", () => {
  const match = html.match(/<script id="excel-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed excel-worker-source");
  assert.doesNotThrow(() => new Function(match[1]));
});

test("file loading guards against stale async results", () => {
  const csvStart = html.indexOf("async function parseCsvFile(file)");
  const csvEnd = html.indexOf("async function startExcelWorkerParse(file", csvStart);
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
  assert.match(excelSource, /startExcelWorkerParse\(file,\s*loadToken,\s*startedAt\)/, "Excel parsing should prefer a guarded worker load");
  assert.match(html, /requestExcelWorkerSheet\(sheetName,\s*startedAt,\s*loadToken\)/, "Excel sheet switching should preserve the active load token");
  assert.match(html, /if \(state\.worker\) state\.worker\.terminate\(\);/, "starting a new load should terminate an active CSV worker");
});

test("CSV and JSONL imports report file-read and worker startup failures", () => {
  const csvStart = html.indexOf("async function parseCsvFile(file)");
  const csvEnd = html.indexOf("async function parseJsonlFile(file)", csvStart);
  const csvSource = html.slice(csvStart, csvEnd);
  const jsonlStart = csvEnd;
  const jsonlEnd = html.indexOf("async function startExcelWorkerParse(file", jsonlStart);
  const jsonlSource = html.slice(jsonlStart, jsonlEnd);

  assert.match(csvSource, /try \{[\s\S]*?await file\.arrayBuffer\(\)/, "CSV import should catch file-read failures");
  assert.match(csvSource, /worker = createCsvWorker\(\)/, "CSV import should catch worker startup failures");
  assert.match(csvSource, /catch \(error\)/, "CSV import should expose unexpected import failures");
  assert.match(csvSource, /textContent = "解析失败"/, "CSV import failures should update the empty state");
  assert.match(jsonlSource, /try \{[\s\S]*?await file\.arrayBuffer\(\)/, "JSONL import should catch file-read failures");
  assert.match(jsonlSource, /worker = createCsvWorker\(\)/, "JSONL import should catch worker startup failures");
  assert.match(jsonlSource, /catch \(error\)/, "JSONL import should expose unexpected import failures");
  assert.match(jsonlSource, /textContent = "JSONL 解析失败"/, "JSONL import failures should update the empty state");
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

test("cell details allow editing the selected cell", () => {
  for (const id of [
    "editedCellCount",
    "undoLastActionButton",
    "redoLastActionButton",
    "editCellButton",
    "saveCellEditButton",
    "cancelCellEditButton",
    "highlightMenu",
    "highlightMenuButton",
    "highlightYellowOption",
    "highlightBlueOption",
    "highlightPinkOption",
    "clearHighlightOption",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  assert.match(html, /id="highlightYellowOption"[^>]*aria-label="黄色高亮"[^>]*><\/button>/, "yellow highlight option should be color-only");
  assert.match(html, /id="highlightBlueOption"[^>]*aria-label="蓝色高亮"[^>]*><\/button>/, "blue highlight option should be color-only");
  assert.match(html, /id="highlightPinkOption"[^>]*aria-label="粉色高亮"[^>]*><\/button>/, "pink highlight option should be color-only");
  assert.match(html, /id="filteredRowStats"[\s\S]*?id="editedCellCount"/, "edited count should sit next to row stats in the top toolbar");
  assert.match(html, /cellEdit:\s*null/, "missing cell edit state");
  assert.match(html, /editedCells:\s*new Map\(\)/, "missing edited-cell tracking state");
  assert.match(html, /manualHighlights:\s*new Map\(\)/, "missing manual highlight state");
  assert.match(html, /undoStack:\s*\[\]/, "missing undo stack state");
  assert.match(html, /redoStack:\s*\[\]/, "missing redo stack state");
  assert.match(html, /function beginCellEdit\(/, "missing edit entry function");
  assert.match(html, /function saveCellEdit\(/, "missing edit save function");
  assert.match(html, /function cancelCellEdit\(/, "missing edit cancel function");
  assert.match(html, /function hasPendingCellEditChange\(/, "missing dirty edit guard");
  assert.match(html, /function setCellValue\(/, "missing selected cell writer");
  assert.match(html, /function syncEditedCellTracking\(/, "missing edited-cell comparison helper");
  assert.match(html, /function pushEditHistory\(/, "missing undo history writer");
  assert.match(html, /function undoLastAction\(/, "missing undo action");
  assert.match(html, /function redoLastAction\(/, "missing redo action");
  assert.match(html, /function setManualHighlight\(/, "missing manual highlight writer");
  assert.match(html, /function getManualHighlightClass\(/, "missing manual highlight renderer helper");
  assert.match(html, /state\.rows\[rowIndex\]\[columnIndex\]\s*=\s*nextValue/, "cell writer should update row data");
  assert.match(html, /state\.cellMeta\.delete\(`\$\{rowIndex\}:\$\{columnIndex\}`\)/, "editing should clear stale Excel metadata");
  assert.match(html, /invalidateColumnValueCache\(columnIndex\)/, "editing should invalidate the edited column cache");
  assert.match(html, /refreshIssuesAfterCellEdits\(new Set\(\[rowIndex\]\)\)/, "editing should refresh issues for the edited row");
  assert.match(html, /state\.editedCells\.delete\(key\)/, "cells restored to their original value should lose edited highlighting");
  assert.match(html, /edited-cell/, "grid cells should render edited highlights");
  assert.match(html, /manual-highlight-yellow/, "grid cells should render yellow manual highlights");
  assert.match(html, /manual-highlight-blue/, "grid cells should render blue manual highlights");
  assert.match(html, /manual-highlight-pink/, "grid cells should render pink manual highlights");
  assert.match(html, /editCellButton\.addEventListener\("click",\s*beginCellEdit\)/, "edit button should start editing");
  assert.match(html, /saveCellEditButton\.addEventListener\("click",\s*saveCellEdit\)/, "save button should persist edits");
  assert.match(html, /cancelCellEditButton\.addEventListener\("click",\s*cancelCellEdit\)/, "cancel button should discard edits");
  assert.match(html, /undoLastActionButton\.addEventListener\("click",\s*undoLastAction\)/, "undo button should revert the latest operation");
  assert.match(html, /redoLastActionButton\.addEventListener\("click",\s*redoLastAction\)/, "redo button should restore the latest undone operation");
  assert.match(html, /event\.shiftKey[\s\S]*redoLastAction\(\)/, "Ctrl/Cmd+Shift+Z should redo undone operations");
  assert.match(html, /当前单元格正在编辑，请先保存或取消/, "dirty edits should block silent selection changes");
});

test("filtered CSV export avoids building one giant joined string", () => {
  const start = html.indexOf("async function exportFilteredCsv(");
  const end = html.indexOf("function copySelectedRow()", start);
  const source = html.slice(start, end);
  assert.match(source, /const parts = \[/, "CSV export should collect blob parts");
  assert.match(source, /parts\.push\(chunk\.join\(""\)\)/, "CSV export should flush row chunks");
  assert.match(source, /openTextFileWritable\(filename\)/, "large CSV export should open a streaming file writer");
  assert.match(source, /target\.writable\.write\(line\)/, "large CSV export should write each decoded row incrementally");
  assert.match(html, /LARGE_EXPORT_BATCH_ROWS\s*=\s*10/, "large CSV export should request small row batches");
  assert.doesNotMatch(source, /lines\.join\("\\r\\n"\)/, "filtered CSV export should not join every row into one huge string");
});

test("issue report export is removed", () => {
  assert.doesNotMatch(html, /id="exportIssuesButton"/, "issue report button should be removed");
  assert.doesNotMatch(html, /function exportIssueReport\(/, "issue report export function should be removed");
  assert.doesNotMatch(html, /function flattenIssues\(/, "unused issue flattening helper should be removed");
  assert.doesNotMatch(html, /导出异常报告/, "removed issue export copy should not remain in the UI");
});

test("brand uses an inline spreadsheet SVG logo", () => {
  assert.match(html, /<svg class="brand-mark"[^>]*viewBox="0 0 36 36"/, "brand should render an inline SVG logo");
  assert.match(html, /<rect x="12" y="7" width="17" height="22"/, "logo should include a spreadsheet sheet");
  assert.match(html, /M20\.5 7v22M12 14\.3h17M12 21\.7h17/, "logo should include spreadsheet grid lines");
  assert.doesNotMatch(html, /\.brand-mark\s*\{[^}]*background-size:/, "brand should no longer use the old CSS-only green mark");
});

test("filtered export supports CSV by default and optional XLSX", () => {
  assert.match(html, /id="exportFormatSelect"/, "missing export format selector");
  assert.match(html, /<option value="csv" selected>CSV<\/option>/, "CSV should be the default export format");
  assert.match(html, /<option value="xlsx">XLSX<\/option>/, "XLSX should be available as an export format");
  assert.match(html, /async function exportFilteredXlsx\(/, "missing filtered XLSX export path");
  assert.match(html, /async function exportFilteredTable\(/, "missing export dispatcher");
  assert.match(html, /sheetJs\.utils\.aoa_to_sheet\(message\.matrix \|\| \[\]\)/, "XLSX worker should build a worksheet from visible filtered rows");
  assert.match(html, /saveBinaryFile\(/, "XLSX export should save the worker-generated binary");
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
  assert.match(html, /当前筛选结果为空，未导出文件/, "empty filtered exports should tell the user nothing was exported");
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
  assert.match(html, /copySelection\(\)/, "copy shortcut should copy the active selection payload");
  assert.match(html, /document\.addEventListener\("keydown",\s*handleCopyShortcut\)/, "document should listen for copy shortcuts");
});

test("selection copy preserves spreadsheet cell boundaries and optional headers", () => {
  assert.match(html, /function escapeHtml\(/, "copy HTML should escape special characters");
  assert.match(html, /function formatPlainClipboardCell\(/, "plain fallback should quote cells with tabs, quotes, or newlines");
  assert.match(html, /text\.replaceAll\('"',\s*'""'\)/, "quoted TSV fallback should escape double quotes");
  assert.match(html, /function selectionIncludesHeaders\(/, "copy should know whether the selected area includes headers");
  assert.match(html, /return range\.type === "columns" \|\| range\.type === "all";/, "only column/all selections should include headers");
  assert.match(html, /function getSelectionCopyPayload\(/, "missing selection copy payload builder");
  assert.match(html, /const htmlRows = \[\];/, "selection copy should build HTML table rows");
  assert.match(html, /data-sheets-value="\$\{sheetsValue\}"/, "HTML copy should mark cells as string values for online sheets");
  assert.match(html, /mso-data-placement:same-cell/, "HTML copy should keep line breaks inside the same spreadsheet cell");
  assert.match(html, /<table><tbody>\$\{htmlRows\.join\(""\)\}<\/tbody><\/table>/, "selection copy should provide an HTML table");
  assert.match(html, /new ClipboardItem\(\{[\s\S]*?"text\/html":\s*new Blob/, "clipboard write should include text/html");
  assert.match(html, /"text\/plain":\s*new Blob/, "clipboard write should include text/plain fallback");
  assert.match(html, /copyClipboardPayload\(await getSelectionCopyPayload\(\)\)/, "selection copy should await the structured clipboard payload");
});

test("context menu closes when focus moves away", () => {
  assert.match(html, /document\.addEventListener\("pointerdown",\s*handleDocumentPointerDown\)/, "context menu should close on pointerdown outside");
  assert.match(html, /function handleDocumentPointerDown\(/, "missing shared pointerdown close handler");
  assert.match(html, /window\.addEventListener\("blur",\s*closeContextMenu\)/, "context menu should close when the window loses focus");
});

test("full cell modal can parse formatted content in a resizable split view", () => {
  for (const id of [
    "modalFormatSelect",
    "modalViewer",
    "modalSplitHandle",
    "modalResizeHandle",
    "modalParsedContent",
    "modalDetectedFormat",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  assert.match(html, /<option value="auto" selected>自动<\/option>/, "format selector should default to auto");
  assert.match(html, /<option value="markdown">Markdown<\/option>/, "markdown format should be selectable");
  assert.match(html, /<option value="json">JSON<\/option>/, "json format should be selectable");
  assert.match(html, /<option value="html">HTML<\/option>/, "html format should be selectable");
  assert.match(html, /<option value="code">代码<\/option>/, "code format should be selectable");
  assert.match(html, /\.modal-viewer\s*{[\s\S]*?grid-template-columns:\s*minmax\(220px,\s*var\(--modal-source-width,\s*50%\)\)\s*7px\s*minmax\(220px,\s*1fr\)/, "modal should use a 50/50 split layout by default");
  assert.match(html, /function detectModalFormat\(/, "missing modal auto format detection");
  assert.match(html, /function renderJsonPreview\(/, "missing JSON preview renderer");
  assert.match(html, /function renderMarkdownPreview\(/, "missing Markdown preview renderer");
  assert.match(html, /className = "json-markdown-toggle"/, "JSON string markdown toggle should be rendered for markdown-like strings");
  assert.match(html, /textContent = "解析 Markdown"/, "JSON markdown toggle should start collapsed");
  assert.match(html, /textContent = "收起 Markdown"/, "JSON markdown toggle should support collapsing after expansion");
  assert.match(html, /renderMarkdownPreview\(value,\s*preview\)/, "JSON markdown toggle should render markdown inside the selected string field");
  assert.match(html, /preview\.dataset\.rendered/, "JSON markdown preview should render lazily");
  assert.match(html, /function renderMarkdownPreview\(text,\s*target = els\.modalParsedContent\)/, "Markdown preview renderer should support custom target containers");
  assert.match(html, /function renderHtmlPreview\(/, "missing HTML preview renderer");
  assert.match(html, /function sanitizeHtmlDocumentForPreview\(/, "HTML preview should sanitize untrusted markup");
  assert.match(html, /querySelectorAll\("script, style, iframe, object, embed, link, meta, base"\)/, "HTML preview should remove style-bearing and external-resource nodes");
  assert.match(html, /@import/, "style sanitization should reject CSS imports");
  assert.match(html, /function startModalSplitResize\(/, "missing modal splitter drag start");
  assert.match(html, /state\.modalSplitResize/, "modal splitter should keep drag state");
  assert.match(html, /modalSplitHandle\.addEventListener\("pointerdown",\s*startModalSplitResize\)/, "modal splitter should be draggable");
  assert.match(html, /width:\s*min\(var\(--modal-width,\s*1280px\),\s*96vw\)/, "modal width should be overridable while preserving the default");
  assert.match(html, /height:\s*min\(var\(--modal-height,\s*780px\),\s*92vh\)/, "modal height should be overridable while preserving the default");
  assert.match(html, /function startModalResize\(/, "missing modal resize drag start");
  assert.match(html, /function setModalSize\(/, "missing modal size clamp helper");
  assert.match(html, /state\.modalResize/, "modal resize should keep drag state");
  assert.match(html, /modalSuppressBackdropClickUntil/, "modal resize should suppress the trailing backdrop click");
  assert.match(html, /Date\.now\(\) \+ 250/, "modal resize suppression should be short-lived");
  assert.match(html, /Date\.now\(\) < state\.modalSuppressBackdropClickUntil/, "backdrop click should ignore resize-generated clicks");
  assert.match(html, /modalResizeHandle\.addEventListener\("pointerdown",\s*startModalResize\)/, "modal resize handle should be draggable");
  assert.match(html, /modalFormatSelect\.addEventListener\("change",\s*renderModal\)/, "format changes should rerender the modal");
  assert.match(html, /els\.modalViewer\.style\.removeProperty\("--modal-source-width"\)/, "opening the modal should restore the default split");
  assert.match(html, /removeProperty\("--modal-width"\)/, "opening the modal should restore the default width");
  assert.match(html, /removeProperty\("--modal-height"\)/, "opening the modal should restore the default height");
});

test("file import button is protected from wrapping in the compact header", () => {
  assert.match(html, /#chooseFileButton\s*{[\s\S]*?white-space:\s*nowrap/, "choose file button should not wrap");
  assert.match(html, /\.file-name-text\s*{[\s\S]*?text-overflow:\s*ellipsis/, "file name should ellipsize in the import area");
});

test("first-stage workspace UI keeps hidden controls hidden and exposes compact mobile tools", () => {
  assert.match(html, /\[hidden\]\s*{[\s\S]*?display:\s*none\s*!important/, "hidden controls must not be revived by component display rules");
  assert.match(html, /id="appRoot"/, "app root should expose the loaded-data layout state");
  assert.match(html, /id="mobileToolsButton"[^>]*aria-controls="mobileToolsPanel"/, "mobile toolbar toggle should control the advanced tools");
  assert.match(html, /function setMobileToolsExpanded\(/, "mobile toolbar should have an explicit state helper");
  assert.match(html, /classList\.toggle\("has-data",\s*hasData\)/, "loaded datasets should switch the compact workspace layout");
  assert.match(html, /if \(!els\.detailPanel\.classList\.contains\("collapsed"\)\) toggleDetailPanel\(\{ animate: false \}\)/, "the empty workspace should start with the detail panel collapsed without animating initialization");
  assert.match(html, /if \(event\.matches && !els\.detailPanel\.classList\.contains\("collapsed"\)\) toggleDetailPanel\(\{ animate: false \}\)/, "narrow screens should collapse the detail panel without animating responsive changes");
});

test("table workspace exposes grid semantics and named column filters", () => {
  assert.match(html, /id="gridViewport"[^>]*role="grid"[^>]*aria-rowcount="0"[^>]*aria-colcount="0"/, "table viewport should expose grid semantics");
  assert.match(html, /filterButton\.setAttribute\("aria-label",\s*`\$\{state\.headers\[col\]\}：筛选与排序`\)/, "column filter buttons should include the column name");
  assert.match(html, /cell\.setAttribute\("role",\s*"gridcell"\)/, "rendered cells should expose gridcell roles");
});

test("second-stage workspace supports a remembered resizable detail panel", () => {
  assert.match(html, /id="detailResizeHandle"[^>]*role="separator"[^>]*aria-orientation="vertical"/, "detail panel should expose an accessible resize handle");
  assert.match(html, /DETAIL_PANEL_WIDTH_STORAGE_KEY\s*=\s*"file-viewer\.detailPanelWidth\.v1"/, "detail width should use a stable storage key");
  assert.match(html, /function setDetailPanelWidth\(/, "detail panel should clamp and apply its width centrally");
  assert.match(html, /localStorage\.setItem\(DETAIL_PANEL_WIDTH_STORAGE_KEY,\s*String\(nextWidth\)\)/, "detail width should be remembered locally");
  assert.match(html, /detailResizeHandle\.addEventListener\("pointerdown",\s*startDetailResize\)/, "detail width should support pointer resizing");
  assert.match(html, /nudgeDetailPanelWidth\(event\.key === "ArrowLeft"/, "detail width should support keyboard resizing");
  assert.match(html, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*7px\s*var\(--detail-width,\s*380px\)/, "workspace grid should reserve a dedicated resize track");
});

test("second-stage filter popover groups high-frequency and advanced actions", () => {
  for (const className of [
    "filter-popover-head",
    "filter-sort-section",
    "filter-values-section",
    "filter-row-actions",
    "filter-column-settings",
  ]) {
    assert.match(html, new RegExp(`class="[^"]*${className}`), `missing .${className}`);
  }
  assert.match(html, /<summary>列设置<\/summary>/, "low-frequency column settings should be progressively disclosed");
  assert.match(html, /id="clearColumnFilterButton">清除筛选<\/button>/, "clear filter should remain available from the popover header");
});

test("modern interaction batch exposes active filters, reversible feedback, and focused export", () => {
  assert.match(html, /function renderActiveFilterBar\(/, "active view constraints should render as removable chips");
  assert.match(html, /appendActiveFilterChip\(`排除 \$\{state\.hiddenRows\.size\.toLocaleString\(\)\} 行`/, "excluded rows should be visible in the active filter bar");
  assert.match(html, /function showToast\(message,\s*options = \{\}\)/, "actions should use a shared toast feedback path");
  assert.match(html, /actionLabel:\s*"撤销"[\s\S]*?state\.hiddenRows = previousHiddenRows/, "row hiding should offer an immediate undo action");
  assert.match(html, /function openExportPopover\(/, "export settings should open in a focused panel");
  assert.match(html, /id="exportMenuButton"[^>]*aria-haspopup="dialog"/, "toolbar export entry should expose dialog semantics");
  assert.match(html, /id="exportFilenamePreview"/, "export panel should preview generated filenames");
});

test("modern interaction batch exposes contextual selection and command-first navigation", () => {
  assert.match(html, /function renderSelectionToolbar\(/, "selection changes should update a contextual action bar");
  assert.match(html, /id="selectionCopyButton">复制<\/button>/, "contextual selection bar should expose copy");
  assert.match(html, /id="selectionEditButton">编辑<\/button>/, "contextual selection bar should expose edit");
  assert.match(html, /function getCommandPaletteCommands\(/, "command palette should use the current workspace state");
  assert.match(html, /state\.headers\.slice\(0,\s*500\)\.forEach/, "command palette should include column-aware commands with a safety cap");
  assert.match(html, /\(event\.ctrlKey \|\| event\.metaKey\) && key === "k"/, "Ctrl or Command K should toggle the command palette");
  assert.match(html, /\(event\.ctrlKey \|\| event\.metaKey\) && key === "f"/, "Ctrl or Command F should focus table search");
  assert.match(html, /id="shortcutHelpBackdrop"[^>]*role="dialog"/, "shortcut help should be an accessible dialog");
});

test("row filtering supports duplicates, row windows, and reversible exclusions", () => {
  assert.match(html, /<option value="duplicate">重复值<\/option>/, "column conditions should expose duplicate-value filtering");
  assert.match(html, /id="rowFilterButton"[^>]*>行范围<\/button>/, "toolbar should expose row range filtering");
  assert.match(html, /id="rowFilterModeSelect"/, "row range popover should expose a mode selector");
  assert.match(html, /id="selectionExcludeButton">排除行<\/button>/, "selection toolbar should exclude selected rows");
  assert.match(html, /data-action="exclude-row">排除此行<\/button>/, "row context menu should exclude its row");
  assert.match(html, /duplicateColumns:\s*\[\.\.\.state\.duplicateFilters\]/, "query requests should serialize duplicate filters");
  assert.match(html, /rowWindow:\s*\{ \.\.\.state\.rowWindow \}/, "query requests should serialize row windows");
  assert.match(html, /function excludeSelectedRows\(/, "selected row exclusion should have a dedicated action");
  assert.match(html, /function applyQueryResult\(result\)[\s\S]*?renderGrid\(\);\s*renderDetail\(\);/, "filtered selections should refresh the detail panel");
});

test("column overview uses a full-width toolbar row", () => {
  assert.match(html, /height:\s*28px/, "column overview should expose one visible row");
  assert.match(html, /overflow-y:\s*auto/, "overflowing column rows should scroll vertically");
  assert.match(html, /flex-wrap:\s*wrap/, "column pills should wrap into internally scrollable rows");
  assert.match(html, /width:\s*max-content[\s\S]*?max-width:\s*none/, "column pills should follow their full label width");
  assert.match(html, /class="column-overview-row"[\s\S]*?id="columnOverview"/, "column overview should be placed in its own toolbar row");
  assert.match(html, /\.column-overview-row\s*{[\s\S]*?width:\s*100%/, "column overview row should span the toolbar width");
  assert.match(html, /\.column-overview\s*{[\s\S]*?width:\s*100%/, "column overview should fill its row");
  assert.match(html, /\.column-overview\s*{[\s\S]*?max-height:\s*28px/, "column overview should keep a compact scrollable height");
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

test("horizontal overscroll and local recovery protect in-progress edits", () => {
  assert.match(html, /html,\s*body\s*\{[\s\S]*?overscroll-behavior-x:\s*contain/, "the app root should contain horizontal overscroll");
  assert.match(html, /\.grid-viewport\s*\{[\s\S]*?overscroll-behavior-x:\s*contain/, "the table viewport should contain horizontal overscroll");
  for (const id of [
    "recoveryDraftBackdrop",
    "recoveryDraftSummary",
    "discardRecoveryDraftButton",
    "restoreRecoveryDraftButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing recovery UI #${id}`);
  }
  assert.match(html, /function getDatasetRecoveryKey\(/, "recovery drafts should match a stable file identity");
  assert.match(html, /fileLastModified:\s*file\.lastModified/, "text imports should retain the file timestamp for recovery matching");
  assert.match(html, /lastModified:\s*workbookFile\.lastModified/, "Excel worker imports should retain the file timestamp for recovery matching");
  assert.match(html, /sessionStorage\.setItem/, "same-tab recovery should be written synchronously");
  assert.match(html, /window\.indexedDB\.open/, "recovery drafts should use IndexedDB for larger edit sets");
  assert.match(html, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/, "unsaved edits should enable a leave-page warning");
  assert.match(html, /window\.addEventListener\("pagehide", flushRecoveryDraft\)/, "page transitions should flush the recovery draft");
  assert.match(html, /function confirmDatasetReplacement\(/, "loading another file should confirm replacement when edits exist");
  assert.match(html, /function restoreRecoveryDraft\(/, "matching local drafts should be restorable");
  assert.match(html, /scheduleRecoveryDraftSave\(\);\s*return true;/, "cell mutations should schedule recovery persistence");
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

test("build script validates all template placeholders", () => {
  for (const placeholder of [
    "/*__INLINE_CSS__*/",
    "/*__CSV_WORKER__*/",
    "/*__QUERY_WORKER__*/",
    "/*__EXCEL_WORKER__*/",
    "/*__LARGE_DATA_WORKER__*/",
    "/*__APP_JS__*/",
    "/*__CSP__*/",
  ]) {
    assert.ok(buildScript.includes(placeholder), `build script should validate ${placeholder}`);
  }
  assert.match(buildScript, /remainingPlaceholders\.length/, "build script should fail when any placeholder remains");
});

test("Excel dependency is pinned, verified, and constrained by CSP", () => {
  assert.match(buildScript, /SHEETJS_SHA256\s*=\s*"c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99"/, "SheetJS hash must be fixed in the build");
  assert.match(buildScript, /SheetJS integrity check failed/, "build must reject a modified SheetJS asset");
  assert.match(html, /Content-Security-Policy/, "single-file distribution needs a CSP");
  assert.match(html, /connect-src 'none'/, "CSP should block outbound connections");
  assert.match(html, /worker-src blob:/, "CSP should allow only generated Workers");
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/, "distribution must not retain a CDN endpoint");
  const vendor = readFileSync(new URL("../vendor/xlsx.full.min.js", import.meta.url));
  assert.equal(
    createHash("sha256").update(vendor).digest("hex"),
    "c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99",
    "vendored SheetJS asset must match the build-time integrity hash",
  );
  const appMatch = html.match(/<script>\n([\s\S]*?)\n    <\/script>/);
  const cspHash = html.match(/script-src 'sha256-([^']+)'/);
  assert.ok(appMatch && cspHash, "CSP must authorize the generated application script by hash");
  assert.equal(
    createHash("sha256").update(`\n${appMatch[1]}\n    `).digest("base64"),
    cspHash[1],
    "CSP application hash must match the generated inline script",
  );
});

test("build script composes application source fragments in dependency order", () => {
  const appSources = [
    "src/app/state.js",
    "src/app/file-io.js",
    "src/app/filtering.js",
    "src/app/profile.js",
    "src/app/table.js",
    "src/app/editing.js",
    "src/app/columns.js",
    "src/app/import.js",
    "src/app/export.js",
    "src/app/main.js",
  ];
  let previousIndex = -1;
  for (const source of appSources) {
    const sourceIndex = buildScript.indexOf(`\"${source}\"`);
    assert.ok(sourceIndex > previousIndex, `${source} should be listed after the previous application fragment`);
    previousIndex = sourceIndex;
  }
  assert.match(buildScript, /Promise\.all\(sources\.app\.map\(readSource\)\)/, "application fragments should load together");
  assert.match(buildScript, /\.\.\.appSources/, "all application fragments should be composed into the inline script");
});

test("column profiling runs in the query worker and exposes filter actions", () => {
  for (const id of [
    "columnProfileModeButton",
    "columnProfileView",
    "columnProfileContent",
    "refreshColumnProfileButton",
    "viewColumnProfileButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `column profile UI should expose #${id}`);
  }
  assert.match(html, /kind:\s*"column-profile"/, "the app should request profiles from the query worker");
  assert.match(html, /type:\s*"column-profile-complete"/, "the query worker should return completed profiles");
  assert.match(html, /function invalidateColumnProfileCache\(/, "column profiles should have explicit cache invalidation");
  assert.match(html, /type:\s*"profile-invalid"/, "profile anomalies should reuse column filter state");
  assert.match(
    html,
    /if \(state\.detailMode === "profile"\) state\.profileColumnIndex = columnIndex/,
    "column profiles should follow the focused column while profile mode stays open",
  );
});
