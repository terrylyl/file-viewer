const PREVIEW_LIMIT = 500;
const DETAIL_CHUNK = 100000;
const MODAL_CHUNK = 100000;
const EXCEL_SAFE_READ_MAX_BYTES = 80 * 1024 * 1024;
const EXCEL_SHARED_STRINGS_MAX_BYTES = 120 * 1024 * 1024;
const EXCEL_CELL_META_SCAN_MAX_CELLS = 200000;
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
const MANUAL_HIGHLIGHT_COLORS = new Set(["yellow", "blue", "pink"]);
const MODAL_FORMAT_LABELS = {
  plain: "纯文本",
  markdown: "Markdown",
  json: "JSON",
  html: "HTML",
  code: "代码",
};
const EXCEL_INDEXED_COLORS = {
  0: "#000000",
  1: "#ffffff",
  2: "#ff0000",
  3: "#00ff00",
  4: "#0000ff",
  5: "#ffff00",
  6: "#ff00ff",
  7: "#00ffff",
  8: "#000000",
  9: "#ffffff",
  10: "#ff0000",
  13: "#ffff00",
  64: "",
  65: "",
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
  excelWorkbook: null,
  excelXLSX: null,
  excelFile: null,
  excelSheetNames: [],
  xlsxConversion: null,
  activeSheetName: "",
  loadToken: 0,
  file: null,
  sourceFileHandle: null,
  viewIndices: [],
  rowPositionMap: new Map(),
  matchedRows: new Set(),
  visibleColumns: [],
  columnOrder: [],
  columnWidths: [],
  columnFilters: {},
  duplicateFilters: new Set(),
  rowWindow: { mode: "all" },
  columnValueCache: new Map(),
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
  manualHighlights: new Map(),
  undoStack: [],
  redoStack: [],
  selectionAnchor: null,
  selectionRange: null,
  selectionDrag: null,
  detailVisibleChars: DETAIL_CHUNK,
  modalVisibleChars: MODAL_CHUNK,
  modalCell: null,
  modalSplitResize: null,
  modalResize: null,
  modalSuppressBackdropClickUntil: 0,
  worker: null,
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

function createExcelWorker() {
  return createInlineWorker("excel-worker-source");
}

function getSheetJsWorkerSources() {
  return [
    new URL("vendor/xlsx.full.min.js", window.location.href).href,
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];
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

function beginLoad() {
  state.loadToken += 1;
  if (state.worker) state.worker.terminate();
  state.worker = null;
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
  return Boolean(
    state.queryWorker &&
    state.queryWorkerReadyVersion === state.queryRowsVersion &&
    !state.queryWorkerDirty,
  );
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
      value: state.rows[change.rowIndex]?.[change.columnIndex] ?? "",
    }));
  if (!normalized.length) return;
  state.queryToken += 1;
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
  state.queryWorker.postMessage({
    kind: "query",
    token,
    version: state.queryRowsVersion,
    request,
  });
  return true;
}
