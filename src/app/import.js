function updateFileStats() {
  els.fileStats.innerHTML = "";
  if (!state.file) return;
  const issueCount =
    state.issues.inconsistentRows.length +
    state.issues.sparseRows.length +
    state.issues.longFields.length +
    (state.issues.duplicateColumns || []).length;
  const stats = [
    state.file.name,
    formatBytes(state.file.size),
    `${state.rows.length.toLocaleString()} 行 × ${state.headers.length.toLocaleString()} 列`,
    state.file.encoding,
    state.file.kind === "CSV" ? delimiterLabel(state.file.delimiter) : state.file.delimiter,
    state.file.sheetCount ? `${state.file.sheetCount} sheets` : "",
    `${state.file.parseMs} ms`,
    `${issueCount.toLocaleString()} 个异常`,
  ].filter(Boolean);
  if ((state.issues.duplicateColumns || []).length) {
    stats.push(`重复列名 ${(state.issues.duplicateColumns || []).length}`);
  }
  const summary = document.createElement("span");
  summary.className = `file-summary${issueCount ? " warning" : ""}`;
  summary.textContent = stats.join(" · ");
  summary.title = summary.textContent;
  els.fileStats.appendChild(summary);
}

function finishWorkspaceReveal() {
  if (workspaceRevealTimer) window.clearTimeout(workspaceRevealTimer);
  workspaceRevealTimer = 0;
  els.appRoot.classList.remove("workspace-revealing", "workspace-reveal-active");
  els.emptyState.style.display = state.rows.length ? "none" : "grid";
}

function beginWorkspaceReveal() {
  if (workspaceRevealTimer) window.clearTimeout(workspaceRevealTimer);
  workspaceRevealTimer = 0;
  els.appRoot.classList.remove("workspace-reveal-active");
  els.appRoot.classList.add("workspace-revealing");
  els.emptyState.style.display = "grid";
}

function activateWorkspaceReveal() {
  if (els.appRoot.classList.contains("workspace-reveal-active")) return;
  requestAnimationFrame(() => {
    if (!els.appRoot.classList.contains("workspace-revealing")) return;
    els.appRoot.classList.add("workspace-reveal-active");
    workspaceRevealTimer = window.setTimeout(finishWorkspaceReveal, 240);
  });
}

function syncAppDataState() {
  const hasData = Boolean(state.headers.length || state.rows.length);
  els.appRoot.classList.toggle("has-data", hasData);
  if (hasData) setMobileToolsExpanded(false);
}

function setDataset(result) {
  const shouldRevealWorkspace =
    !state.headers.length &&
    !state.rows.length &&
    Boolean(result.rows?.length) &&
    window.matchMedia("(min-width: 981px)").matches;
  if (shouldRevealWorkspace) beginWorkspaceReveal();
  else finishWorkspaceReveal();
  state.headers = result.headers || [];
  state.originalHeaders = [...state.headers];
  state.rows = createChunkedRows(result.rows || []);
  state.rowChunks = state.rows.__chunks;
  state.issues = result.issues || { inconsistentRows: [], sparseRows: [], longFields: [], duplicateColumns: [] };
  state.cellMeta = result.cellMeta instanceof Map
    ? result.cellMeta
    : Array.isArray(result.cellMetaEntries)
      ? new Map(result.cellMetaEntries)
      : new Map();
  state.file = result.file || null;
  state.visibleColumns = state.headers.map(() => true);
  state.columnOrder = state.headers.map((_, index) => index);
  state.columnWidths = state.headers.map((header) =>
    Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, Math.max(DEFAULT_COL_WIDTH, String(header).length * 10 + 36))),
  );
  clearAllColumnFilters();
  invalidateColumnValueCache();
  invalidateColumnProfileCache();
  state.customColumns = new Set();
  state.concatenateColumnItems = [];
  state.concatenateDragIndex = -1;
  state.dragColumn = null;
  state.hiddenRows = new Set();
  state.rowWindow = { mode: "all" };
  state.columnFilterMenu = { columnIndex: -1, query: "" };
  state.detailMode = "cell";
  state.profileColumnIndex = -1;
  state.sort = { column: -1, direction: "none" };
  state.selected = state.rows.length && state.headers.length ? { rowIndex: 0, columnIndex: 0 } : null;
  state.cellEdit = null;
  state.editedCells = new Map();
  state.manualHighlights = new Map();
  state.undoStack = [];
  state.redoStack = [];
  state.selectionDrag = null;
  state.cellVersions = new Map();
  state.cellRenderCache = new Map();
  clearSelectionToSelected();
  updateSearchColumns();
  renderColumnPopover();
  renderColumnOverview();
  updateFileStats();
  syncAppDataState();
  if (window.matchMedia("(min-width: 981px)").matches && els.detailPanel.classList.contains("collapsed")) {
    toggleDetailPanel({ animate: false });
  }
  seedQueryWorker();
  recomputeView();
  renderDetail();
  els.columnsButton.disabled = !state.headers.length;
  els.addColumnButton.disabled = !state.headers.length;
  els.concatenateColumnButton.disabled = !state.headers.length;
  els.rowFilterButton.disabled = !state.rows.length;
  els.clearAllFiltersButton.disabled = !state.headers.length;
  els.exportFormatSelect.disabled = !state.rows.length;
  els.exportSplitCountInput.disabled = !state.rows.length;
  els.exportCsvButton.disabled = !state.rows.length;
  els.exportMenuButton.disabled = !state.rows.length;
  updateClipboardImportButton();
  setProgress(1, "解析完成");
}

function updateSheetSelect(sheetNames = [], activeSheetName = "") {
  state.excelSheetNames = sheetNames;
  state.activeSheetName = activeSheetName;
  els.sheetSelect.innerHTML = "";
  if (!sheetNames.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未加载";
    els.sheetSelect.appendChild(option);
    els.sheetSelect.disabled = true;
    els.sheetSelectLabel.hidden = true;
    return;
  }
  for (const sheetName of sheetNames) {
    const option = document.createElement("option");
    option.value = sheetName;
    option.textContent = sheetName;
    els.sheetSelect.appendChild(option);
  }
  els.sheetSelect.value = activeSheetName || sheetNames[0];
  els.sheetSelect.disabled = sheetNames.length <= 1;
  els.sheetSelectLabel.hidden = false;
}

function resetExcelWorkbook() {
  if (state.excelWorker) state.excelWorker.terminate();
  state.excelWorker = null;
  state.excelWorkbook = null;
  state.excelXLSX = null;
  state.excelFile = null;
  updateSheetSelect([], "");
}

function normalizeExcelWorkerResult(result) {
  if (!result) return null;
  return {
    ...result,
    cellMeta: Array.isArray(result.cellMetaEntries) ? new Map(result.cellMetaEntries) : new Map(),
  };
}

function buildExcelDatasetFromSheet(sheetName, startedAt = Date.now()) {
  if (!state.excelWorkbook || !state.excelXLSX || !state.excelFile) {
    throw new Error("未加载 Excel 工作簿");
  }
  const sheet = state.excelWorkbook.Sheets[sheetName];
  if (!sheet) throw new Error(`未找到 Sheet：${sheetName}`);
  const XLSX = state.excelXLSX;
  const valueRange = trimExcelSheetRefToContent(sheet, XLSX);
  const matrix = trimExcelMatrixToContent(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }));
  const maxColumns = getMatrixColumnCount(matrix);
  const rawHeaders = matrix[0] || [];
  const headers = Array.from({ length: maxColumns }, (_, index) => {
    const value = rawHeaders[index] == null || rawHeaders[index] === "" ? `Column ${index + 1}` : String(rawHeaders[index]);
    return value;
  });
  const rows = matrix.slice(1).map((row) =>
    Array.from({ length: maxColumns }, (_, index) => (row[index] == null ? "" : String(row[index]))),
  );
  return {
    headers,
    rows,
    cellMeta: collectExcelCellMetaSafely(sheet, matrix.length, maxColumns, XLSX, valueRange),
    issues: analyzeRows(headers, rows),
    file: {
      name: state.excelFile.name,
      size: state.excelFile.size,
      encoding: "Excel workbook",
      delimiter: sheetName,
      parseMs: Date.now() - startedAt,
      kind: "Excel",
      sheetCount: state.excelSheetNames.length,
    },
  };
}

function applyExcelWorkerSheetResult(message, loadToken) {
  if (!isCurrentLoad(loadToken)) return;
  const result = normalizeExcelWorkerResult(message.result);
  if (!result) throw new Error("Excel Worker 未返回 Sheet 数据");
  updateSheetSelect(message.sheetNames || state.excelSheetNames, message.activeSheetName || result.file?.delimiter || "");
  setDataset(result);
}

function requestExcelWorkerSheet(sheetName, startedAt = Date.now(), loadToken = state.loadToken) {
  if (!state.excelWorker || !sheetName || !isCurrentLoad(loadToken)) return false;
  setProgress(0.58, `Worker 转换 Sheet：${sheetName}`);
  updateSheetSelect(state.excelSheetNames, sheetName);
  state.excelWorker.postMessage({
    kind: "load-sheet",
    token: loadToken,
    sheetName,
    startedAt,
  });
  return true;
}

function loadExcelSheet(sheetName, startedAt = Date.now(), loadToken = state.loadToken) {
  if (!sheetName) return;
  if (!isCurrentLoad(loadToken)) return;
  if (state.excelWorker && !state.excelWorkbook && requestExcelWorkerSheet(sheetName, startedAt, loadToken)) return;
  try {
    setProgress(0.58, `转换 Sheet：${sheetName}`);
    updateSheetSelect(state.excelSheetNames, sheetName);
    const result = buildExcelDatasetFromSheet(sheetName, startedAt);
    if (!isCurrentLoad(loadToken)) return;
    setDataset(result);
  } catch (error) {
    if (!isCurrentLoad(loadToken)) return;
    setProgress(0, `Excel Sheet 读取失败：${error.message}`);
    els.emptyState.style.display = "grid";
    els.emptyState.querySelector("strong").textContent = "Excel Sheet 读取失败";
    els.emptyState.querySelector("span").textContent = error.message;
  }
}

async function parseCsvFile(file) {
  const loadToken = beginLoad();
  resetExcelWorkbook();
  setProgress(0.02, "读取文件");
  els.emptyState.style.display = "grid";
  els.emptyState.querySelector("strong").textContent = "正在解析";
  els.emptyState.querySelector("span").textContent = file.name;
  let worker = null;
  try {
    const buffer = await file.arrayBuffer();
    if (!isCurrentLoad(loadToken)) return;

    worker = createCsvWorker();
    state.worker = worker;
    worker.onmessage = (event) => {
      if (!isCurrentLoad(loadToken)) return;
      const message = event.data || {};
      if (message.type === "progress") {
        setProgress(message.progress, message.stage);
      } else if (message.type === "complete") {
        setDataset(message.result);
        worker.terminate();
        if (state.worker === worker) state.worker = null;
      } else if (message.type === "error") {
        setProgress(0, `解析失败：${message.message}`);
        els.emptyState.querySelector("strong").textContent = "解析失败";
        els.emptyState.querySelector("span").textContent = message.message;
        worker.terminate();
        if (state.worker === worker) state.worker = null;
      }
    };

    worker.postMessage(
      {
        kind: "parse-csv",
        fileName: file.name,
        fileSize: file.size,
        encoding: els.encodingSelect.value,
        previewLimit: PREVIEW_LIMIT,
        longFieldThreshold: 50000,
        buffer,
      },
      [buffer],
    );
  } catch (error) {
    if (!isCurrentLoad(loadToken)) return;
    if (worker) worker.terminate();
    if (state.worker === worker) state.worker = null;
    setProgress(0, `解析失败：${error.message}`);
    els.emptyState.querySelector("strong").textContent = "解析失败";
    els.emptyState.querySelector("span").textContent = error.message;
  }
}

async function parseJsonlFile(file) {
  const loadToken = beginLoad();
  resetExcelWorkbook();
  setProgress(0.02, "读取 JSONL 文件");
  els.emptyState.style.display = "grid";
  els.emptyState.querySelector("strong").textContent = "正在解析 JSONL";
  els.emptyState.querySelector("span").textContent = file.name;
  let worker = null;
  try {
    const buffer = await file.arrayBuffer();
    if (!isCurrentLoad(loadToken)) return;

    worker = createCsvWorker();
    state.worker = worker;
    worker.onmessage = (event) => {
      if (!isCurrentLoad(loadToken)) return;
      const message = event.data || {};
      if (message.type === "progress") {
        setProgress(message.progress, message.stage);
      } else if (message.type === "complete") {
        setDataset(message.result);
        worker.terminate();
        if (state.worker === worker) state.worker = null;
      } else if (message.type === "error") {
        setProgress(0, `JSONL 解析失败：${message.message}`);
        els.emptyState.querySelector("strong").textContent = "JSONL 解析失败";
        els.emptyState.querySelector("span").textContent = message.message;
        worker.terminate();
        if (state.worker === worker) state.worker = null;
      }
    };

    worker.postMessage(
      {
        kind: "parse-jsonl",
        fileName: file.name,
        fileSize: file.size,
        encoding: els.encodingSelect.value,
        longFieldThreshold: 50000,
        buffer,
      },
      [buffer],
    );
  } catch (error) {
    if (!isCurrentLoad(loadToken)) return;
    if (worker) worker.terminate();
    if (state.worker === worker) state.worker = null;
    setProgress(0, `JSONL 解析失败：${error.message}`);
    els.emptyState.querySelector("strong").textContent = "JSONL 解析失败";
    els.emptyState.querySelector("span").textContent = error.message;
  }
}

async function ensureSheetJs() {
  if (window.XLSX) return window.XLSX;
  const sources = [
    "vendor/xlsx.full.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];
  for (const source of sources) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = source;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`加载失败：${source}`));
        document.head.appendChild(script);
      });
      if (window.XLSX) return window.XLSX;
    } catch (error) {
      continue;
    }
  }
  throw new Error("无法加载 SheetJS，Excel 读取或 XLSX 导出需要网络或 vendor/xlsx.full.min.js");
}

function normalizeExcelColor(color) {
  if (!color) return "";
  if (typeof color === "string") {
    const value = color.trim().replace(/^#/, "");
    if (/^[0-9a-f]{8}$/i.test(value)) return `#${value.slice(2).toLowerCase()}`;
    if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
    return "";
  }
  if (color.rgb) {
    const value = String(color.rgb).trim().replace(/^#/, "");
    if (/^[0-9a-f]{8}$/i.test(value)) return `#${value.slice(2).toLowerCase()}`;
    if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  }
  if (color.indexed != null && Object.prototype.hasOwnProperty.call(EXCEL_INDEXED_COLORS, color.indexed)) {
    return EXCEL_INDEXED_COLORS[color.indexed];
  }
  return "";
}

function getExcelCell(sheet, rowIndex, columnIndex, XLSX) {
  if (Array.isArray(sheet)) return sheet[rowIndex]?.[columnIndex] || null;
  if (Array.isArray(sheet["!data"])) return sheet["!data"][rowIndex]?.[columnIndex] || null;
  return sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] || null;
}

function extractExcelCellMeta(cell) {
  if (!cell) return null;
  const style = typeof cell.s === "object" && cell.s ? cell.s : {};
  const fill = style.fill || style.patternFill || {};
  const font = style.font || {};
  const backgroundColor = normalizeExcelColor(fill.fgColor || fill.bgColor || style.fgColor || style.bgColor);
  const color = normalizeExcelColor(font.color || style.color);
  const html = typeof cell.h === "string" && /<[^>]+>/.test(cell.h) ? cell.h : "";
  const link = normalizeLinkHref(cell.l?.Target || "");
  const meta = {};
  if (backgroundColor && backgroundColor !== "#ffffff") meta.backgroundColor = backgroundColor;
  if (color) meta.color = color;
  if (html) meta.html = html;
  if (link) meta.link = link;
  return Object.keys(meta).length ? meta : null;
}

function collectExcelCellMeta(sheet, rowCount, columnCount, XLSX, range = null) {
  const cellMeta = new Map();
  const startRow = range?.s?.r || 0;
  const startColumn = range?.s?.c || 0;
  for (let row = 1; row < rowCount; row += 1) {
    for (let col = 0; col < columnCount; col += 1) {
      const meta = extractExcelCellMeta(getExcelCell(sheet, startRow + row, startColumn + col, XLSX));
      if (meta) cellMeta.set(`${row - 1}:${col}`, meta);
    }
  }
  return cellMeta;
}

function collectExcelCellMetaSafely(sheet, rowCount, columnCount, XLSX, range = null) {
  if (rowCount * columnCount > EXCEL_CELL_META_SCAN_MAX_CELLS) return new Map();
  return collectExcelCellMeta(sheet, rowCount, columnCount, XLSX, range);
}

function refreshIssuesAfterCellEdits(rowIndexes) {
  const touchedRows = new Set([...rowIndexes].filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0));
  const keepUntouchedRowIssue = (issue) => !touchedRows.has((issue.rowNumber || 0) - 2);
  state.issues = {
    duplicateColumns: detectDuplicateHeaderIssues(state.headers),
    inconsistentRows: (state.issues.inconsistentRows || []).filter(keepUntouchedRowIssue),
    sparseRows: (state.issues.sparseRows || []).filter(keepUntouchedRowIssue),
    longFields: (state.issues.longFields || []).filter(keepUntouchedRowIssue),
  };
  [...touchedRows]
    .sort((left, right) => left - right)
    .forEach((rowIndex) => appendRowIssues(state.issues, state.headers, state.rows[rowIndex], rowIndex));
}

async function parseExcelFileOnMainThread(file, loadToken, startedAt) {
  const XLSX = await ensureSheetJs();
  if (!isCurrentLoad(loadToken)) return;
  setProgress(0.2, "读取 Excel");
  const buffer = await file.arrayBuffer();
  if (!isCurrentLoad(loadToken)) return;
  const workbook = XLSX.read(buffer, getExcelReadOptions());
  if (!isCurrentLoad(loadToken)) return;
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("工作簿中没有可读取的 Sheet");
  state.excelWorkbook = workbook;
  state.excelXLSX = XLSX;
  state.excelFile = file;
  updateSheetSelect(workbook.SheetNames, sheetName);
  loadExcelSheet(sheetName, startedAt, loadToken);
}

async function startExcelWorkerParse(file, loadToken, startedAt) {
  if (!window.Worker) return false;
  try {
    const buffer = await file.arrayBuffer();
    if (!isCurrentLoad(loadToken)) return true;
    const worker = createExcelWorker();
    state.excelWorker = worker;
    state.excelFile = file;
    worker.onmessage = async (event) => {
      if (worker !== state.excelWorker || !isCurrentLoad(loadToken)) return;
      const message = event.data || {};
      if (message.token !== loadToken) return;
      if (message.type === "sheet-complete") {
        state.excelSheetNames = message.sheetNames || [];
        state.activeSheetName = message.activeSheetName || "";
        applyExcelWorkerSheetResult(message, loadToken);
        return;
      }
      if (message.type === "error") {
        if (message.stage === "load-sheetjs") {
          worker.terminate();
          if (state.excelWorker === worker) state.excelWorker = null;
          try {
            setProgress(0.12, "Worker 加载失败，改用主线程 Excel 解析");
            await parseExcelFileOnMainThread(file, loadToken, startedAt);
          } catch (fallbackError) {
            if (!isCurrentLoad(loadToken)) return;
            setProgress(0, `Excel 解析失败：${fallbackError.message}`);
            els.emptyState.style.display = "grid";
            els.emptyState.querySelector("strong").textContent = "Excel 解析失败";
            els.emptyState.querySelector("span").textContent = fallbackError.message;
            await offerXlsxCsvConversion(file, loadToken);
          }
          return;
        }
        setProgress(0, `Excel 解析失败：${message.message}`);
        els.emptyState.style.display = "grid";
        els.emptyState.querySelector("strong").textContent = "Excel 解析失败";
        els.emptyState.querySelector("span").textContent = message.message;
        await offerXlsxCsvConversion(file, loadToken);
      }
    };
    setProgress(0.18, "Worker 读取 Excel");
    worker.postMessage(
      {
        kind: "load-workbook",
        token: loadToken,
        startedAt,
        file: { name: file.name, size: file.size },
        sources: getSheetJsWorkerSources(),
        buffer,
      },
      [buffer],
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function parseExcelFile(file) {
  const loadToken = beginLoad();
  const startedAt = Date.now();
  setProgress(0.05, "加载 Excel 解析器");
  try {
    resetExcelWorkbook();
    assertExcelFileWithinSafeLimit(file);
    setProgress(0.08, "检查 Excel 压缩结构");
    await assertExcelSharedStringsWithinSafeLimit(file);
    if (!isCurrentLoad(loadToken)) return;
    if (await startExcelWorkerParse(file, loadToken, startedAt)) return;
    await parseExcelFileOnMainThread(file, loadToken, startedAt);
  } catch (error) {
    if (!isCurrentLoad(loadToken)) return;
    setProgress(0, `Excel 解析失败：${error.message}`);
    els.emptyState.style.display = "grid";
    els.emptyState.querySelector("strong").textContent = "Excel 解析失败";
    els.emptyState.querySelector("span").textContent = error.message;
    await offerXlsxCsvConversion(file, loadToken);
  }
}

async function openFileWithPicker() {
  if (!window.showOpenFilePicker) {
    els.fileInput.click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Table files",
          accept: {
            "text/csv": [".csv", ".tsv", ".txt"],
            "application/x-ndjson": [".jsonl"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            "application/vnd.ms-excel": [".xls"],
          },
        },
      ],
    });
    if (!handle) return;
    const file = await handle.getFile();
    handleFiles([file], handle);
  } catch (error) {
    if (!error || error.name !== "AbortError") {
      els.fileInput.click();
    }
  }
}

function handleFiles(files, sourceFileHandle = null) {
  const file = files && files[0];
  if (!file) return;
  const lower = file.name.toLocaleLowerCase();
  els.fileHint.textContent = file.name;
  els.fileHint.title = file.name;
  state.sourceFileHandle = sourceFileHandle;
  els.searchInput.value = "";
  els.detailSearchInput.value = "";
  els.modalSearchInput.value = "";
  closeClipboardImportPopover();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    parseExcelFile(file);
  } else if (lower.endsWith(".jsonl")) {
    parseJsonlFile(file);
  } else {
    parseCsvFile(file);
  }
}
