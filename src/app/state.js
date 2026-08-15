const PREVIEW_LIMIT = 500;
const DETAIL_CHUNK = 100000;
const MODAL_CHUNK = 100000;
const EXCEL_SAFE_READ_MAX_BYTES = 80 * 1024 * 1024;
const EXCEL_SHARED_STRINGS_MAX_BYTES = 120 * 1024 * 1024;
const EXCEL_CELL_META_SCAN_MAX_CELLS = 200000;
const LARGE_TEXT_FILE_THRESHOLD = 24 * 1024 * 1024;
const LARGE_TEXT_FILE_MAX_BYTES = 500 * 1024 * 1024;
const LARGE_PREVIEW_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const LARGE_CELL_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const LARGE_FULL_ROW_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const LARGE_EXPENSIVE_OPERATION_MAX_BYTES = 128 * 1024 * 1024;
const LARGE_LOAD_STALL_NOTICE_MS = 15000;
const LARGE_LOAD_STALL_FAILURE_MS = 45000;
const LARGE_CLIPBOARD_MAX_ROWS = 20;
const ROW_HEIGHT = 34;
const WRAP_ROW_HEIGHT = 180;
const HEADER_HEIGHT = 38;
const ROW_NUMBER_WIDTH = 64;
const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 720;
const MIN_MODAL_PANE_WIDTH = 220;
const MIN_MODAL_WIDTH = 720;
const MIN_MODAL_HEIGHT = 420;
const MODAL_VIEWPORT_MARGIN = 44;
const DETAIL_PANEL_WIDTH_STORAGE_KEY = "file-viewer.detailPanelWidth.v1";
const MIN_DETAIL_PANEL_WIDTH = 300;
const MAX_DETAIL_PANEL_WIDTH = 720;
const DETAIL_PANEL_WIDTH_STEP = 24;
const CONCATENATE_SCHEMES_STORAGE_KEY = "file-viewer.concatenateSchemes.v1";
const MAX_CONCATENATE_SCHEMES = 20;
const MAX_EDIT_HISTORY = 1000;
const MAX_CELL_RENDER_CACHE = 3000;
const ROW_CHUNK_SIZE = 5000;
const COLUMN_UNIQUE_WORKER_THRESHOLD = 10000;
const RECOVERY_DRAFT_SESSION_PREFIX = "file-viewer.recoveryDraft.v1:";
const RECOVERY_DRAFT_DATABASE = "file-viewer-recovery";
const RECOVERY_DRAFT_STORE = "drafts";
const RECOVERY_DRAFT_SAVE_DELAY = 300;
const MANUAL_HIGHLIGHT_COLORS = new Set(["yellow", "blue", "pink"]);
const MODAL_FORMAT_LABELS = {
  plain: "纯文本",
  markdown: "Markdown",
  json: "JSON",
  html: "HTML",
  code: "代码",
};
const els = {
  appRoot: document.getElementById("appRoot"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  chooseFileButton: document.getElementById("chooseFileButton"),
  emptyChooseFileButton: document.getElementById("emptyChooseFileButton"),
  emptyClipboardImportButton: document.getElementById("emptyClipboardImportButton"),
  clipboardImportButton: document.getElementById("clipboardImportButton"),
  clipboardImportPopover: document.getElementById("clipboardImportPopover"),
  clipboardFirstRowHeaderInput: document.getElementById("clipboardFirstRowHeaderInput"),
  cancelClipboardImportButton: document.getElementById("cancelClipboardImportButton"),
  confirmClipboardImportButton: document.getElementById("confirmClipboardImportButton"),
  fileHint: document.getElementById("fileHint"),
  fileStats: document.getElementById("fileStats"),
  toolbar: document.getElementById("toolbar"),
  mobileToolsButton: document.getElementById("mobileToolsButton"),
  encodingSelect: document.getElementById("encodingSelect"),
  delimiterSelect: document.getElementById("delimiterSelect"),
  headerRowInput: document.getElementById("headerRowInput"),
  strictCsvInput: document.getElementById("strictCsvInput"),
  sheetSelectLabel: document.getElementById("sheetSelectLabel"),
  sheetSelect: document.getElementById("sheetSelect"),
  searchInput: document.getElementById("searchInput"),
  searchColumnSelect: document.getElementById("searchColumnSelect"),
  caseSensitiveInput: document.getElementById("caseSensitiveInput"),
  matchedOnlyInput: document.getElementById("matchedOnlyInput"),
  wrapCellsInput: document.getElementById("wrapCellsInput"),
  clearSearchButton: document.getElementById("clearSearchButton"),
  filteredRowStats: document.getElementById("filteredRowStats"),
  activeFilterBar: document.getElementById("activeFilterBar"),
  activeFilterChips: document.getElementById("activeFilterChips"),
  clearActiveFiltersButton: document.getElementById("clearActiveFiltersButton"),
  columnsButton: document.getElementById("columnsButton"),
  addColumnButton: document.getElementById("addColumnButton"),
  concatenateColumnButton: document.getElementById("concatenateColumnButton"),
  rowFilterButton: document.getElementById("rowFilterButton"),
  rowFilterPopover: document.getElementById("rowFilterPopover"),
  closeRowFilterPopoverButton: document.getElementById("closeRowFilterPopoverButton"),
  rowFilterModeSelect: document.getElementById("rowFilterModeSelect"),
  rowFilterCountLabel: document.getElementById("rowFilterCountLabel"),
  rowFilterCountInput: document.getElementById("rowFilterCountInput"),
  rowFilterRangeFields: document.getElementById("rowFilterRangeFields"),
  rowFilterStartInput: document.getElementById("rowFilterStartInput"),
  rowFilterEndInput: document.getElementById("rowFilterEndInput"),
  rowFilterStatus: document.getElementById("rowFilterStatus"),
  clearRowFilterButton: document.getElementById("clearRowFilterButton"),
  applyRowFilterButton: document.getElementById("applyRowFilterButton"),
  clearAllFiltersButton: document.getElementById("clearAllFiltersButton"),
  exportCsvButton: document.getElementById("exportCsvButton"),
  exportMenuButton: document.getElementById("exportMenuButton"),
  exportPopover: document.getElementById("exportPopover"),
  closeExportPopoverButton: document.getElementById("closeExportPopoverButton"),
  exportSummary: document.getElementById("exportSummary"),
  exportFilenamePreview: document.getElementById("exportFilenamePreview"),
  exportFormatSelect: document.getElementById("exportFormatSelect"),
  exportSplitCountInput: document.getElementById("exportSplitCountInput"),
  gridViewport: document.getElementById("gridViewport"),
  gridCanvas: document.getElementById("gridCanvas"),
  headerRow: document.getElementById("headerRow"),
  rowLayer: document.getElementById("rowLayer"),
  emptyState: document.getElementById("emptyState"),
  selectionToolbar: document.getElementById("selectionToolbar"),
  selectionToolbarStatus: document.getElementById("selectionToolbarStatus"),
  selectionCopyButton: document.getElementById("selectionCopyButton"),
  selectionEditButton: document.getElementById("selectionEditButton"),
  selectionHighlightButton: document.getElementById("selectionHighlightButton"),
  selectionOpenButton: document.getElementById("selectionOpenButton"),
  selectionExcludeButton: document.getElementById("selectionExcludeButton"),
  mainLayout: document.getElementById("mainLayout"),
  detailResizeHandle: document.getElementById("detailResizeHandle"),
  detailPanel: document.getElementById("detailPanel"),
  restoreDetailButton: document.getElementById("restoreDetailButton"),
  toggleDetailButton: document.getElementById("toggleDetailButton"),
  detailPanelTitle: document.getElementById("detailPanelTitle"),
  cellDetailModeButton: document.getElementById("cellDetailModeButton"),
  columnProfileModeButton: document.getElementById("columnProfileModeButton"),
  cellDetailView: document.getElementById("cellDetailView"),
  columnProfileView: document.getElementById("columnProfileView"),
  columnProfileTitle: document.getElementById("columnProfileTitle"),
  columnProfileType: document.getElementById("columnProfileType"),
  columnProfileContent: document.getElementById("columnProfileContent"),
  columnProfileStatus: document.getElementById("columnProfileStatus"),
  refreshColumnProfileButton: document.getElementById("refreshColumnProfileButton"),
  detailMeta: document.getElementById("detailMeta"),
  editedCellCount: document.getElementById("editedCellCount"),
  undoLastActionButton: document.getElementById("undoLastActionButton"),
  redoLastActionButton: document.getElementById("redoLastActionButton"),
  detailSearchInput: document.getElementById("detailSearchInput"),
  copyCellButton: document.getElementById("copyCellButton"),
  editCellButton: document.getElementById("editCellButton"),
  saveCellEditButton: document.getElementById("saveCellEditButton"),
  cancelCellEditButton: document.getElementById("cancelCellEditButton"),
  highlightMenu: document.getElementById("highlightMenu"),
  highlightMenuButton: document.getElementById("highlightMenuButton"),
  highlightYellowOption: document.getElementById("highlightYellowOption"),
  highlightBlueOption: document.getElementById("highlightBlueOption"),
  highlightPinkOption: document.getElementById("highlightPinkOption"),
  clearHighlightOption: document.getElementById("clearHighlightOption"),
  openModalButton: document.getElementById("openModalButton"),
  monoInput: document.getElementById("monoInput"),
  detailContent: document.getElementById("detailContent"),
  detailStatus: document.getElementById("detailStatus"),
  loadMoreDetailButton: document.getElementById("loadMoreDetailButton"),
  leftStatus: document.getElementById("leftStatus"),
  rightStatus: document.getElementById("rightStatus"),
  progressBar: document.getElementById("progressBar"),
  cancelLoadButton: document.getElementById("cancelLoadButton"),
  xlsxConvertActions: document.getElementById("xlsxConvertActions"),
  xlsxConvertSheetSelect: document.getElementById("xlsxConvertSheetSelect"),
  xlsxConvertCsvButton: document.getElementById("xlsxConvertCsvButton"),
  xlsxConvertStatus: document.getElementById("xlsxConvertStatus"),
  columnsPopover: document.getElementById("columnsPopover"),
  columnOverview: document.getElementById("columnOverview"),
  columnList: document.getElementById("columnList"),
  showAllColumnsButton: document.getElementById("showAllColumnsButton"),
  hideAllColumnsButton: document.getElementById("hideAllColumnsButton"),
  addColumnPopover: document.getElementById("addColumnPopover"),
  newColumnNameInput: document.getElementById("newColumnNameInput"),
  newColumnModeSelect: document.getElementById("newColumnModeSelect"),
  copyColumnSelect: document.getElementById("copyColumnSelect"),
  constantColumnValueLabel: document.getElementById("constantColumnValueLabel"),
  constantColumnValueInput: document.getElementById("constantColumnValueInput"),
  cancelAddColumnButton: document.getElementById("cancelAddColumnButton"),
  confirmAddColumnButton: document.getElementById("confirmAddColumnButton"),
  concatenateColumnPopover: document.getElementById("concatenateColumnPopover"),
  concatenateSchemeSelect: document.getElementById("concatenateSchemeSelect"),
  applyConcatenateSchemeButton: document.getElementById("applyConcatenateSchemeButton"),
  concatenateColumnNameInput: document.getElementById("concatenateColumnNameInput"),
  concatenateRows: document.getElementById("concatenateRows"),
  addConcatenateRowButton: document.getElementById("addConcatenateRowButton"),
  cancelConcatenateColumnButton: document.getElementById("cancelConcatenateColumnButton"),
  confirmConcatenateColumnButton: document.getElementById("confirmConcatenateColumnButton"),
  concatenateValidationStatus: document.getElementById("concatenateValidationStatus"),
  columnFilterBackdrop: document.getElementById("columnFilterBackdrop"),
  columnFilterPopover: document.getElementById("columnFilterPopover"),
  columnFilterTitle: document.getElementById("columnFilterTitle"),
  renameColumnInput: document.getElementById("renameColumnInput"),
  renameColumnButton: document.getElementById("renameColumnButton"),
  restoreColumnNameButton: document.getElementById("restoreColumnNameButton"),
  viewColumnProfileButton: document.getElementById("viewColumnProfileButton"),
  filterSortAscButton: document.getElementById("filterSortAscButton"),
  filterSortDescButton: document.getElementById("filterSortDescButton"),
  columnFilterSearchInput: document.getElementById("columnFilterSearchInput"),
  columnConditionOperatorSelect: document.getElementById("columnConditionOperatorSelect"),
  columnConditionValueInput: document.getElementById("columnConditionValueInput"),
  columnConditionValueLabelText: document.getElementById("columnConditionValueLabelText"),
  columnConditionHint: document.getElementById("columnConditionHint"),
  clearColumnFilterButton: document.getElementById("clearColumnFilterButton"),
  closeColumnFilterButton: document.getElementById("closeColumnFilterButton"),
  selectAllFilterValuesButton: document.getElementById("selectAllFilterValuesButton"),
  selectNoFilterValuesButton: document.getElementById("selectNoFilterValuesButton"),
  hideFilteredRowsButton: document.getElementById("hideFilteredRowsButton"),
  showHiddenRowsButton: document.getElementById("showHiddenRowsButton"),
  deleteCustomColumnButton: document.getElementById("deleteCustomColumnButton"),
  columnFilterSummary: document.getElementById("columnFilterSummary"),
  columnFilterValues: document.getElementById("columnFilterValues"),
  contextMenu: document.getElementById("contextMenu"),
  commandPaletteBackdrop: document.getElementById("commandPaletteBackdrop"),
  commandPaletteInput: document.getElementById("commandPaletteInput"),
  commandPaletteList: document.getElementById("commandPaletteList"),
  shortcutHelpBackdrop: document.getElementById("shortcutHelpBackdrop"),
  closeShortcutHelpButton: document.getElementById("closeShortcutHelpButton"),
  recoveryDraftBackdrop: document.getElementById("recoveryDraftBackdrop"),
  recoveryDraftSummary: document.getElementById("recoveryDraftSummary"),
  discardRecoveryDraftButton: document.getElementById("discardRecoveryDraftButton"),
  restoreRecoveryDraftButton: document.getElementById("restoreRecoveryDraftButton"),
  toastRegion: document.getElementById("toastRegion"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modalTitle: document.getElementById("modalTitle"),
  closeModalButton: document.getElementById("closeModalButton"),
  modalSearchInput: document.getElementById("modalSearchInput"),
  modalFormatSelect: document.getElementById("modalFormatSelect"),
  copyModalButton: document.getElementById("copyModalButton"),
  modalMonoInput: document.getElementById("modalMonoInput"),
  modalViewer: document.getElementById("modalViewer"),
  modalSplitHandle: document.getElementById("modalSplitHandle"),
  modalResizeHandle: document.getElementById("modalResizeHandle"),
  modalContent: document.getElementById("modalContent"),
  modalParsedContent: document.getElementById("modalParsedContent"),
  modalDetectedFormat: document.getElementById("modalDetectedFormat"),
  modalStatus: document.getElementById("modalStatus"),
  loadMoreModalButton: document.getElementById("loadMoreModalButton"),
};

const state = {
  headers: [],
  originalHeaders: [],
  rows: [],
  rowChunks: [],
  issues: { inconsistentRows: [], sparseRows: [], longFields: [], duplicateColumns: [] },
  cellMeta: new Map(),
  excelSheetNames: [],
  xlsxConversion: null,
  activeSheetName: "",
  loadToken: 0,
  file: null,
  sourceFileHandle: null,
  // 探测判错时要能手动重来，所以留着原始 File；只对文本表格路径有意义。
  sourceTextFile: null,
  viewIndices: [],
  rowPositionMap: new Map(),
  largeRowPositionMemo: new Map(),
  matchedRows: new Set(),
  visibleColumns: [],
  columnOrder: [],
  columnWidths: [],
  columnFilters: {},
  duplicateFilters: new Set(),
  rowWindow: { mode: "all" },
  columnValueCache: new Map(),
  columnValueTruncated: new Set(),
  columnValuePending: new Set(),
  columnValueTokens: new Map(),
  columnValueTokenCounter: 0,
  columnProfileCache: new Map(),
  columnProfilePending: new Set(),
  columnProfileTokens: new Map(),
  columnProfileTokenCounter: 0,
  detailMode: "cell",
  profileColumnIndex: -1,
  customColumns: new Set(),
  columnFilterMenu: { columnIndex: -1, query: "" },
  concatenateColumnItems: [],
  concatenateSchemes: [],
  concatenateDragIndex: -1,
  hiddenRows: new Set(),
  dragColumn: null,
  wrapCells: false,
  sort: { column: -1, direction: "none" },
  selected: null,
  cellEdit: null,
  editedCells: new Map(),
  datasetRecoveryKey: "",
  pendingRecoveryDraft: null,
  recoveryDraftSaveTimer: 0,
  recoveryDraftCheckToken: 0,
  hasBeforeUnloadGuard: false,
  manualHighlights: new Map(),
  undoStack: [],
  redoStack: [],
  selectionAnchor: null,
  selectionRange: null,
  selectionDrag: null,
  detailVisibleChars: DETAIL_CHUNK,
  detailVisibleStart: 0,
  modalVisibleChars: MODAL_CHUNK,
  modalVisibleStart: 0,
  modalCell: null,
  modalSplitResize: null,
  modalResize: null,
  modalSuppressBackdropClickUntil: 0,
  worker: null,
  largeLoadWatchdog: 0,
  largeDataWorker: null,
  largeData: null,
  excelWorker: null,
  queryWorker: null,
  queryToken: 0,
  queryRowsVersion: 0,
  queryWorkerReadyVersion: 0,
  queryWorkerDirty: false,
  resize: null,
  detailResize: null,
  resizeFrame: 0,
  pendingResizePoint: null,
  commandPaletteIndex: 0,
  commandPaletteCommands: [],
  renderQueued: false,
  headerDirty: true,
  cellVersions: new Map(),
  cellRenderCache: new Map(),
};

const dialogReturnFocus = new WeakMap();
const concatenateMotionIds = new WeakMap();
let workspaceRevealTimer = 0;
let concatenateMotionId = 0;

function createInlineWorker(scriptId) {
  const source = document.getElementById(scriptId).textContent;
  const blob = new Blob([source], { type: "text/javascript" });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  URL.revokeObjectURL(workerUrl);
  return worker;
}

function createCsvWorker() {
  return createInlineWorker("csv-worker-source");
}

function createQueryWorker() {
  return createInlineWorker("query-worker-source");
}

function createLargeDataWorker() {
  return createInlineWorker("large-data-worker-source");
}

function createExcelWorker() {
  return createInlineWorker("excel-worker-source");
}

function isRowIndexProperty(property) {
  if (typeof property !== "string" || property === "") return false;
  const index = Number(property);
  return Number.isInteger(index) && index >= 0 && String(index) === property;
}

function createRowChunks(rows, chunkSize = ROW_CHUNK_SIZE) {
  const sourceRows = Array.isArray(rows)
    ? rows
    : rows && typeof rows.toArray === "function"
      ? rows.toArray()
      : [];
  const chunks = [];
  for (let index = 0; index < sourceRows.length; index += chunkSize) {
    chunks.push(sourceRows.slice(index, index + chunkSize));
  }
  return chunks;
}

function getRowFromChunks(chunks, index, chunkSize = ROW_CHUNK_SIZE) {
  if (!Number.isInteger(index) || index < 0) return undefined;
  const chunk = chunks[Math.floor(index / chunkSize)];
  return chunk ? chunk[index % chunkSize] : undefined;
}

function createChunkedRows(rows, chunkSize = ROW_CHUNK_SIZE) {
  const chunks = createRowChunks(rows, chunkSize);
  const target = {
    __chunks: chunks,
    __chunkSize: chunkSize,
    __rowCount: rows && typeof rows.length === "number" ? rows.length : chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  };
  let proxy;
  proxy = new Proxy(target, {
    get(store, property) {
      if (property === "length") return store.__rowCount;
      if (property === "__chunks") return store.__chunks;
      if (property === "__chunkSize") return store.__chunkSize;
      if (property === "toArray") {
        return () => store.__chunks.flat();
      }
      if (property === "forEach") {
        return (callback, thisArg) => {
          let rowIndex = 0;
          for (const chunk of store.__chunks) {
            for (const row of chunk) {
              callback.call(thisArg, row, rowIndex, proxy);
              rowIndex += 1;
            }
          }
        };
      }
      if (property === "map") {
        return (callback, thisArg) => {
          const result = [];
          proxy.forEach((row, rowIndex) => result.push(callback.call(thisArg, row, rowIndex, proxy)));
          return result;
        };
      }
      if (property === "slice") {
        return (start = 0, end = store.__rowCount) => proxy.toArray().slice(start, end);
      }
      if (property === Symbol.iterator) {
        return function* iterateRows() {
          for (const chunk of store.__chunks) {
            for (const row of chunk) yield row;
          }
        };
      }
      if (isRowIndexProperty(property)) return getRowFromChunks(store.__chunks, Number(property), store.__chunkSize);
      return store[property];
    },
    set(store, property, value) {
      if (!isRowIndexProperty(property)) {
        store[property] = value;
        return true;
      }
      const index = Number(property);
      const chunkIndex = Math.floor(index / store.__chunkSize);
      const offset = index % store.__chunkSize;
      while (store.__chunks.length <= chunkIndex) store.__chunks.push([]);
      store.__chunks[chunkIndex][offset] = value;
      store.__rowCount = Math.max(store.__rowCount, index + 1);
      return true;
    },
  });
  return proxy;
}

function createLargeRows(rowCount) {
  const target = { __rowCount: rowCount };
  return new Proxy(target, {
    get(store, property) {
      if (property === "length") return store.__rowCount;
      if (isRowIndexProperty(property)) return state.largeData?.rowCache.get(Number(property));
      return store[property];
    },
  });
}

function isLargeDataMode() {
  return Boolean(state.largeData && state.largeDataWorker);
}

function getDataRow(rowIndex) {
  return isLargeDataMode() ? state.largeData.rowCache.get(rowIndex) : state.rows[rowIndex];
}

function hasDataRowIndex(rowIndex) {
  return Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < state.rows.length;
}

function estimateLargeTextBytes(value) {
  return String(value == null ? "" : value).length * 2 + 16;
}

function estimateLargeRowBytes(row) {
  return (row || []).reduce((sum, value) => sum + estimateLargeTextBytes(value), 32);
}

function setLargeWeightedCacheEntry(cache, key, value, bytes, sizeKey, maxBytes) {
  const existing = cache.get(key);
  if (existing) state.largeData[sizeKey] -= existing.bytes;
  cache.delete(key);
  cache.set(key, { ...value, bytes });
  state.largeData[sizeKey] += bytes;
  while (state.largeData[sizeKey] > maxBytes && cache.size > 1) {
    const oldestKey = cache.keys().next().value;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    state.largeData[sizeKey] -= oldest?.bytes || 0;
  }
}

function cacheLargePreview(entry) {
  const bytes = estimateLargeRowBytes(entry.row) + (entry.lengths?.length || 0) * 8;
  setLargeWeightedCacheEntry(
    state.largeData.previewCache,
    entry.rowIndex,
    { row: entry.row, lengths: entry.lengths || [] },
    bytes,
    "previewCacheBytes",
    LARGE_PREVIEW_CACHE_MAX_BYTES,
  );
}

function cacheLargeCell(cell) {
  const key = getCellKey(cell.rowIndex, cell.columnIndex);
  setLargeWeightedCacheEntry(
    state.largeData.cellCache,
    key,
    { value: String(cell.value ?? "") },
    estimateLargeTextBytes(cell.value),
    "cellCacheBytes",
    LARGE_CELL_CACHE_MAX_BYTES,
  );
}

function cacheLargeFullRow(rowIndex, row) {
  const bytes = estimateLargeRowBytes(row);
  const existing = state.largeData.rowCache.get(rowIndex);
  if (existing) state.largeData.rowCacheBytes -= estimateLargeRowBytes(existing);
  state.largeData.rowCache.delete(rowIndex);
  state.largeData.rowCache.set(rowIndex, row);
  state.largeData.rowCacheBytes += bytes;
  while (state.largeData.rowCacheBytes > LARGE_FULL_ROW_CACHE_MAX_BYTES && state.largeData.rowCache.size > 1) {
    const oldestKey = state.largeData.rowCache.keys().next().value;
    const oldest = state.largeData.rowCache.get(oldestKey);
    state.largeData.rowCache.delete(oldestKey);
    state.largeData.rowCacheBytes -= estimateLargeRowBytes(oldest);
  }
}

function getDisplayRow(rowIndex) {
  if (!isLargeDataMode()) return getDataRow(rowIndex);
  const fullRow = state.largeData.rowCache.get(rowIndex);
  if (fullRow) return fullRow;
  return state.largeData.previewCache.get(rowIndex)?.row;
}

function getDataCellValue(rowIndex, columnIndex) {
  if (isLargeDataMode() && state.largeData.editedValues.has(getCellKey(rowIndex, columnIndex))) {
    return state.largeData.editedValues.get(getCellKey(rowIndex, columnIndex));
  }
  const row = getDataRow(rowIndex);
  if (row) return row[columnIndex] == null ? "" : String(row[columnIndex]);
  if (!isLargeDataMode()) return undefined;
  return state.largeData.cellCache.get(getCellKey(rowIndex, columnIndex))?.value;
}

function syncLargePreviewAfterCellChange(rowIndex, columnIndex, value) {
  if (!isLargeDataMode()) return;
  state.largeData.editedValues.set(getCellKey(rowIndex, columnIndex), String(value ?? ""));
  const preview = state.largeData.previewCache.get(rowIndex);
  if (preview) {
    // 多留一个字符，summarize() 才能识别出编辑后的长文本同样是被截断显示的
    preview.row[columnIndex] = String(value ?? "").slice(0, PREVIEW_LIMIT + 1);
    preview.lengths[columnIndex] = String(value ?? "").length;
  }
  cacheLargeCell({ rowIndex, columnIndex, value });
}

function canRunLargeExpensiveOperation() {
  return !isLargeDataMode() || Number(state.file?.size || 0) <= LARGE_EXPENSIVE_OPERATION_MAX_BYTES;
}

function requestLargePreviews(rowIndices) {
  if (!isLargeDataMode()) return Promise.resolve([]);
  const indices = [...new Set(rowIndices || [])].filter((rowIndex) =>
    Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < state.rows.length &&
      !state.largeData.previewCache.has(rowIndex) && !state.largeData.rowCache.has(rowIndex) &&
      !state.largeData.pendingPreviewRows.has(rowIndex),
  );
  if (!indices.length) return Promise.resolve([]);
  const token = state.largeData.nextPreviewToken + 1;
  state.largeData.nextPreviewToken = token;
  indices.forEach((rowIndex) => state.largeData.pendingPreviewRows.add(rowIndex));
  return new Promise((resolve, reject) => {
    state.largeData.pendingPreviews.set(token, { resolve, reject, indices });
    state.largeDataWorker.postMessage({ kind: "get-previews", token, indices, previewChars: PREVIEW_LIMIT });
  });
}

function prefetchLargePreviews(rowIndices) {
  if (!isLargeDataMode()) return;
  requestLargePreviews(rowIndices).then((rows) => {
    if (!rows.length) return;
    renderRowsOnly();
  }).catch((error) => {
    els.leftStatus.textContent = `读取大文件预览失败：${error.message}`;
  });
}

function requestLargeCell(rowIndex, columnIndex) {
  if (!isLargeDataMode()) return Promise.resolve(null);
  const key = getCellKey(rowIndex, columnIndex);
  const cachedValue = getDataCellValue(rowIndex, columnIndex);
  if (cachedValue !== undefined) return Promise.resolve({ rowIndex, columnIndex, value: cachedValue });
  const pending = state.largeData.pendingCellKeys.get(key);
  if (pending) return pending;
  const token = state.largeData.nextCellToken + 1;
  state.largeData.nextCellToken = token;
  const promise = new Promise((resolve, reject) => {
    state.largeData.pendingCells.set(token, { resolve, reject, key });
    state.largeDataWorker.postMessage({ kind: "get-cell", token, rowIndex, columnIndex });
  });
  state.largeData.pendingCellKeys.set(key, promise);
  return promise;
}

function prefetchLargeCell(rowIndex, columnIndex, options = {}) {
  if (!isLargeDataMode()) return;
  requestLargeCell(rowIndex, columnIndex).then((cell) => {
    if (!cell) return;
    if (options.detail !== false) renderDetail();
    if (state.modalCell && options.modal !== false) renderModal();
  }).catch((error) => {
    els.leftStatus.textContent = `读取完整单元格失败：${error.message}`;
  });
}

function requestLargeRows(rowIndices, options = {}) {
  if (!isLargeDataMode()) return Promise.resolve((rowIndices || []).map((rowIndex) => getDataRow(rowIndex)));
  const indices = [...new Set(rowIndices || [])].filter((rowIndex) =>
    Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < state.rows.length,
  );
  if (!indices.length) return Promise.resolve([]);
  const token = state.largeData.nextRowToken + 1;
  state.largeData.nextRowToken = token;
  return new Promise((resolve, reject) => {
    state.largeData.pendingRows.set(token, { resolve, reject, cache: options.cache === true });
    state.largeDataWorker.postMessage({ kind: "get-rows", token, indices });
  });
}

function prefetchLargeRows(rowIndices, options = {}) {
  if (!isLargeDataMode()) return;
  requestLargeRows(rowIndices, { cache: true }).then((rows) => {
    if (!rows.length) return;
    renderGrid();
    if (options.detail !== false) renderDetail();
    if (state.modalCell && options.modal !== false) renderModal();
  }).catch((error) => {
    els.leftStatus.textContent = `读取大文件数据失败：${error.message}`;
  });
}

async function getLargeDataRows(rowIndices) {
  if (!isLargeDataMode()) return (rowIndices || []).map((rowIndex) => getDataRow(rowIndex));
  const rows = await requestLargeRows(rowIndices, { cache: false });
  const rowsByIndex = new Map(rows.map(({ rowIndex, row }) => [rowIndex, row]));
  return (rowIndices || []).map((rowIndex) => rowsByIndex.get(rowIndex));
}

function beginLoad() {
  state.loadToken += 1;
  if (state.largeLoadWatchdog) window.clearInterval(state.largeLoadWatchdog);
  state.largeLoadWatchdog = 0;
  if (state.worker) state.worker.terminate();
  state.worker = null;
  if (state.largeDataWorker) state.largeDataWorker.terminate();
  state.largeDataWorker = null;
  state.largeData = null;
  els.cancelLoadButton.hidden = true;
  terminateQueryWorker();
  resetXlsxConversionOffer();
  return state.loadToken;
}

function isCurrentLoad(loadToken) {
  return loadToken === state.loadToken;
}

function terminateQueryWorker() {
  state.queryToken += 1;
  if (state.queryWorker) state.queryWorker.terminate();
  state.queryWorker = null;
  state.queryWorkerReadyVersion = 0;
  state.queryWorkerDirty = false;
}

function canUseQueryWorker() {
  if (isLargeDataMode()) return true;
  return Boolean(
    state.queryWorker &&
    state.queryWorkerReadyVersion === state.queryRowsVersion &&
    !state.queryWorkerDirty,
  );
}

function initializeLargeDataWorker(worker, result) {
  terminateQueryWorker();
  state.largeDataWorker = worker;
  state.largeData = {
    rowCache: new Map(),
    rowCacheBytes: 0,
    previewCache: new Map(),
    previewCacheBytes: 0,
    cellCache: new Map(),
    cellCacheBytes: 0,
    pendingRows: new Map(),
    pendingPreviews: new Map(),
    pendingPreviewRows: new Set(),
    pendingCells: new Map(),
    pendingCellKeys: new Map(),
    editedValues: new Map(),
    nextRowToken: 0,
    nextPreviewToken: 0,
    nextCellToken: 0,
    nextQueryToken: 0,
    pendingMutations: new Map(),
  };
  state.rows = createLargeRows(result.rowCount || 0);
  state.rowChunks = [];
  worker.onmessage = (event) => {
    if (worker !== state.largeDataWorker) return;
    const message = event.data || {};
    if (message.type === "progress") {
      setProgress(message.progress, message.stage);
      return;
    }
    if (message.type === "operation-progress") {
      if (message.token === state.queryToken) setProgress(message.progress, message.stage);
      return;
    }
    if (message.type === "rows") {
      const pending = state.largeData.pendingRows.get(message.token);
      state.largeData.pendingRows.delete(message.token);
      if (pending?.cache) (message.rows || []).forEach(({ rowIndex, row }) => cacheLargeFullRow(rowIndex, row));
      if (pending) pending.resolve(message.rows || []);
      return;
    }
    if (message.type === "previews") {
      const pending = state.largeData.pendingPreviews.get(message.token);
      state.largeData.pendingPreviews.delete(message.token);
      pending?.indices.forEach((rowIndex) => state.largeData.pendingPreviewRows.delete(rowIndex));
      (message.rows || []).forEach(cacheLargePreview);
      if (pending) pending.resolve(message.rows || []);
      return;
    }
    if (message.type === "cell") {
      const pending = state.largeData.pendingCells.get(message.token);
      state.largeData.pendingCells.delete(message.token);
      if (pending?.key) state.largeData.pendingCellKeys.delete(pending.key);
      if (message.cell) cacheLargeCell(message.cell);
      if (pending) pending.resolve(message.cell || null);
      return;
    }
    if (message.type === "query-complete") {
      if (message.token !== state.queryToken) return;
      applyQueryResult(message.result || { viewIndices: [], matchedRows: [] });
      return;
    }
    if (message.type === "unique-values-complete") {
      const columnKey = String(message.columnIndex);
      if (message.token !== state.columnValueTokens.get(columnKey)) return;
      state.columnValueCache.set(columnKey, message.values || []);
      if (message.truncated) state.columnValueTruncated.add(columnKey);
      else state.columnValueTruncated.delete(columnKey);
      state.columnValuePending.delete(columnKey);
      state.columnValueTokens.delete(columnKey);
      if (state.columnFilterMenu.columnIndex === message.columnIndex) renderColumnFilterValues();
      return;
    }
    if (message.type === "column-profile-complete") {
      const columnKey = String(message.columnIndex);
      if (message.token !== state.columnProfileTokens.get(columnKey)) return;
      state.columnProfileCache.set(columnKey, message.profile);
      state.columnProfilePending.delete(columnKey);
      state.columnProfileTokens.delete(columnKey);
      if (state.detailMode === "profile" && state.profileColumnIndex === message.columnIndex) renderColumnProfile();
      return;
    }
    if (message.type === "patched" || message.type === "columns-transformed") {
      const pending = state.largeData.pendingMutations.get(message.token);
      state.largeData.pendingMutations.delete(message.token);
      if (pending) pending.resolve();
      return;
    }
    if (message.type === "error") {
      const rowPending = state.largeData.pendingRows.get(message.token);
      state.largeData.pendingRows.delete(message.token);
      if (rowPending) rowPending.reject(new Error(message.message));
      const previewPending = state.largeData.pendingPreviews.get(message.token);
      state.largeData.pendingPreviews.delete(message.token);
      previewPending?.indices.forEach((rowIndex) => state.largeData.pendingPreviewRows.delete(rowIndex));
      if (previewPending) previewPending.reject(new Error(message.message));
      const cellPending = state.largeData.pendingCells.get(message.token);
      state.largeData.pendingCells.delete(message.token);
      if (cellPending?.key) state.largeData.pendingCellKeys.delete(cellPending.key);
      if (cellPending) cellPending.reject(new Error(message.message));
      const mutationPending = state.largeData.pendingMutations.get(message.token);
      state.largeData.pendingMutations.delete(message.token);
      if (mutationPending) mutationPending.reject(new Error(message.message));
      if (message.token === state.queryToken) els.leftStatus.textContent = `大文件计算失败：${message.message}`;
    }
  };
  const handleLargeWorkerFailure = (message) => {
    if (worker !== state.largeDataWorker || !state.largeData) return;
    const error = new Error(message);
    for (const pending of state.largeData.pendingRows.values()) pending.reject(error);
    for (const pending of state.largeData.pendingPreviews.values()) pending.reject(error);
    for (const pending of state.largeData.pendingCells.values()) pending.reject(error);
    for (const pending of state.largeData.pendingMutations.values()) pending.reject(error);
    state.largeData.pendingRows.clear();
    state.largeData.pendingPreviews.clear();
    state.largeData.pendingPreviewRows.clear();
    state.largeData.pendingCells.clear();
    state.largeData.pendingCellKeys.clear();
    state.largeData.pendingMutations.clear();
    els.leftStatus.textContent = `大文件 Worker 已停止：${message}`;
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    handleLargeWorkerFailure(event.message || "可能是浏览器内存不足或原文件读取失败");
  };
  worker.onmessageerror = () => handleLargeWorkerFailure("Worker 返回的数据无法读取");
}

function runLargeDataMutation(kind, payload) {
  if (!isLargeDataMode()) return Promise.resolve();
  const token = state.largeData.nextQueryToken + 1;
  state.largeData.nextQueryToken = token;
  return new Promise((resolve, reject) => {
    state.largeData.pendingMutations.set(token, { resolve, reject });
    state.largeDataWorker.postMessage({ kind, token, ...payload });
  });
}

function seedQueryWorker() {
  terminateQueryWorker();
  if (!state.rows.length) return;
  const worker = createQueryWorker();
  const version = state.queryRowsVersion + 1;
  state.queryRowsVersion = version;
  state.queryWorker = worker;
  worker.onmessage = (event) => {
    if (worker !== state.queryWorker) return;
    const message = event.data || {};
    if (message.version !== state.queryRowsVersion) return;
    if (message.type === "ready") {
      if (state.queryWorkerDirty) {
        seedQueryWorker();
        return;
      }
      state.queryWorkerReadyVersion = message.version;
      recomputeView();
      return;
    }
    if (message.type === "query-complete") {
      if (message.token !== state.queryToken) return;
      applyQueryResult(message.result || { viewIndices: [], matchedRows: [] });
      return;
    }
    if (message.type === "query-error") {
      if (message.token !== state.queryToken) return;
      els.leftStatus.textContent = `筛选计算失败：${message.message}`;
      applyQueryResult(computeViewSync());
      return;
    }
    if (message.type === "unique-values-complete") {
      const columnKey = String(message.columnIndex);
      if (message.token !== state.columnValueTokens.get(columnKey)) return;
      state.columnValueCache.set(columnKey, message.values || []);
      state.columnValuePending.delete(columnKey);
      state.columnValueTokens.delete(columnKey);
      if (state.columnFilterMenu.columnIndex === message.columnIndex) renderColumnFilterValues();
      return;
    }
    if (message.type === "unique-values-error") {
      const columnKey = String(message.columnIndex);
      if (message.token !== state.columnValueTokens.get(columnKey)) return;
      state.columnValuePending.delete(columnKey);
      state.columnValueTokens.delete(columnKey);
      if (state.columnFilterMenu.columnIndex === message.columnIndex) {
        els.columnFilterSummary.textContent = `本列值统计失败：${message.message}`;
      }
      return;
    }
    if (message.type === "column-profile-complete") {
      const columnKey = String(message.columnIndex);
      if (message.token !== state.columnProfileTokens.get(columnKey)) return;
      state.columnProfileCache.set(columnKey, message.profile);
      state.columnProfilePending.delete(columnKey);
      state.columnProfileTokens.delete(columnKey);
      if (state.detailMode === "profile" && state.profileColumnIndex === message.columnIndex) renderColumnProfile();
      return;
    }
    if (message.type === "column-profile-error") {
      const columnKey = String(message.columnIndex);
      if (message.token !== state.columnProfileTokens.get(columnKey)) return;
      state.columnProfilePending.delete(columnKey);
      state.columnProfileTokens.delete(columnKey);
      if (state.detailMode === "profile" && state.profileColumnIndex === message.columnIndex) {
        renderColumnProfileError(message.message);
      }
    }
  };
  worker.postMessage({
    kind: "set-data",
    version,
    chunks: state.rowChunks,
    rowCount: state.rows.length,
    chunkSize: ROW_CHUNK_SIZE,
  });
}

function serializeActiveColumnFilters() {
  return Object.entries(state.columnFilters).map(([columnKey, filter]) => {
    const mode = filter.mode === "exclude" ? "exclude" : filter.mode === "all" ? "all" : "include";
    const sourceValues = filter.allowedValues || filter.values || new Set();
    return {
      columnIndex: Number(columnKey),
      mode,
      values: [...sourceValues],
      condition: filter.condition ? { ...filter.condition } : null,
    };
  });
}

function getViewQueryRequest() {
  return {
    query: els.searchInput.value,
    caseSensitive: els.caseSensitiveInput.checked,
    selectedColumn: Number(els.searchColumnSelect.value),
    matchedOnly: els.matchedOnlyInput.checked,
    filters: serializeActiveColumnFilters(),
    duplicateColumns: [...state.duplicateFilters],
    hiddenRows: [...state.hiddenRows],
    sort: { ...state.sort },
    rowWindow: { ...state.rowWindow },
  };
}

function patchQueryWorkerCells(changes) {
  const normalized = (changes || [])
    .filter((change) => Number.isInteger(change.rowIndex) && Number.isInteger(change.columnIndex))
    .map((change) => ({
      rowIndex: change.rowIndex,
      columnIndex: change.columnIndex,
      value: getDataCellValue(change.rowIndex, change.columnIndex) ?? "",
    }));
  if (!normalized.length) return;
  state.queryToken += 1;
  if (isLargeDataMode()) {
    runLargeDataMutation("patch-cells", { changes: normalized }).catch((error) => {
      els.leftStatus.textContent = `保存大文件编辑失败：${error.message}`;
    });
    return;
  }
  if (!canUseQueryWorker()) {
    state.queryWorkerDirty = Boolean(state.queryWorker);
    return;
  }
  state.queryWorker.postMessage({
    kind: "patch-cells",
    version: state.queryRowsVersion,
    changes: normalized,
  });
}

function runQueryInWorker(request) {
  if (!canUseQueryWorker()) return false;
  const token = state.queryToken + 1;
  state.queryToken = token;
  const worker = isLargeDataMode() ? state.largeDataWorker : state.queryWorker;
  worker.postMessage({
    kind: "query",
    token,
    ...(isLargeDataMode() ? {} : { version: state.queryRowsVersion }),
    request,
  });
  return true;
}
