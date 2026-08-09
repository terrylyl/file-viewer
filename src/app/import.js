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
    Boolean(result.largeWorker ? result.rowCount : result.rows?.length) &&
    window.matchMedia("(min-width: 981px)").matches;
  if (shouldRevealWorkspace) beginWorkspaceReveal();
  else finishWorkspaceReveal();
  state.headers = result.headers || [];
  state.originalHeaders = [...state.headers];
  if (result.largeWorker) initializeLargeDataWorker(result.largeWorker, result);
  else {
    state.rows = createChunkedRows(result.rows || []);
    state.rowChunks = state.rows.__chunks;
  }
  state.issues = result.issues || { inconsistentRows: [], sparseRows: [], longFields: [], duplicateColumns: [] };
  state.cellMeta = result.cellMeta instanceof Map
    ? result.cellMeta
    : Array.isArray(result.cellMetaEntries)
      ? new Map(result.cellMetaEntries)
      : new Map();
  state.file = result.file || null;
  state.datasetRecoveryKey = getDatasetRecoveryKey(state.file);
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
  if (isLargeDataMode()) recomputeView();
  else seedQueryWorker();
  renderDetail();
  checkForRecoveryDraft();
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

function shouldUseLargeTextDataPath(file) {
  return file.size >= LARGE_TEXT_FILE_THRESHOLD;
}

// .tsv 的分隔符由扩展名确定：带标题行的 TSV 会被探测判成逗号，而扩展名是确定的证据。
// .csv 不强制逗号——部分地区导出的 CSV 用分号。
function delimiterFromFileName(name) {
  return /\.tsv$/i.test(name || "") ? "\t" : "";
}

// 手动指定优先于扩展名，扩展名优先于探测。探测本身存在无法消除的歧义
// （前言行与正文里的 Markdown 表格在前 20 条记录里是同构的），所以必须有人工兜底。
function resolveImportDelimiter(file) {
  return els.delimiterSelect.value || delimiterFromFileName(file?.name);
}

function resolveImportHeaderRow() {
  const value = Number.parseInt(els.headerRowInput.value, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function setImportOverridesEnabled(enabled) {
  els.delimiterSelect.disabled = !enabled;
  els.headerRowInput.disabled = !enabled;
}

// 换文件时必须清掉：上一份文件的手动分隔符静默套到新文件上比探测判错更难查。
function resetImportOverrides() {
  els.delimiterSelect.value = "";
  els.headerRowInput.value = "";
}

function reimportWithOverrides() {
  const file = state.sourceTextFile;
  if (!file) return;
  if (!confirmDatasetReplacement()) return;
  parseCsvFile(file);
}

function cancelActiveLoad() {
  if (!state.worker) return;
  beginLoad();
  setProgress(0, "已取消读取");
  els.emptyState.style.display = "grid";
  els.emptyState.querySelector("strong").textContent = "已取消读取";
  els.emptyState.querySelector("span").textContent = "可以重新选择文件";
}

async function parseLargeTextFile(file, fileKind) {
  const loadToken = beginLoad();
  if (file.size > LARGE_TEXT_FILE_MAX_BYTES) {
    const message = `大文件模式当前上限为 ${formatBytes(LARGE_TEXT_FILE_MAX_BYTES)}；请先拆分文件后重试`;
    setProgress(0, `大文件解析失败：${message}`);
    els.emptyState.style.display = "grid";
    els.emptyState.querySelector("strong").textContent = "文件超过读取上限";
    els.emptyState.querySelector("span").textContent = message;
    return;
  }
  resetExcelWorkbook();
  setProgress(0.01, "准备大文件读取");
  els.cancelLoadButton.hidden = false;
  els.emptyState.style.display = "grid";
  els.emptyState.querySelector("strong").textContent = "正在流式解析大文件";
  els.emptyState.querySelector("span").textContent = `${file.name} · 正在建立原文件偏移索引，不会复制完整文件`;
  let worker = null;
  let lastActivityAt = Date.now();
  const clearLoadWatchdog = () => {
    if (state.largeLoadWatchdog) window.clearInterval(state.largeLoadWatchdog);
    state.largeLoadWatchdog = 0;
  };
  const failLargeLoad = (message) => {
    if (!isCurrentLoad(loadToken)) return;
    clearLoadWatchdog();
    els.cancelLoadButton.hidden = true;
    state.worker = null;
    worker?.terminate();
    setProgress(0, `大文件解析失败：${message}`);
    els.emptyState.querySelector("strong").textContent = "大文件解析失败";
    els.emptyState.querySelector("span").textContent = message;
  };
  try {
    worker = createLargeDataWorker();
  } catch (error) {
    failLargeLoad(error.message || "当前浏览器无法启动大文件 Worker");
    return;
  }
  state.worker = worker;
  state.largeLoadWatchdog = window.setInterval(() => {
    if (!isCurrentLoad(loadToken)) {
      clearLoadWatchdog();
      return;
    }
    const stalledFor = Date.now() - lastActivityAt;
    if (stalledFor >= LARGE_LOAD_STALL_FAILURE_MS) {
      failLargeLoad("超过 45 秒未收到读取进度，Worker 可能已因内存不足而停止");
      return;
    }
    if (stalledFor >= LARGE_LOAD_STALL_NOTICE_MS) {
      els.emptyState.querySelector("span").textContent = `${file.name} · 后台仍在处理超大单元格，可继续等待或取消读取`;
    }
  }, 3000);
  worker.onmessage = (event) => {
    if (!isCurrentLoad(loadToken)) return;
    const message = event.data || {};
    lastActivityAt = Date.now();
    if (message.type === "progress") {
      setProgress(message.progress, message.stage);
      return;
    }
    if (message.type === "loaded") {
      clearLoadWatchdog();
      els.cancelLoadButton.hidden = true;
      state.worker = null;
      setDataset({ ...message.result, largeWorker: worker, rowCount: message.result.rowCount });
      els.leftStatus.textContent = `大文件已就绪：${message.result.rowCount.toLocaleString()} 行；当前仅缓存视口附近的数据`;
      return;
    }
    if (message.type === "error") {
      failLargeLoad(message.message || "未知错误");
    }
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    failLargeLoad(event.message || "大文件 Worker 意外退出，可能是浏览器内存不足或文件读取失败");
  };
  worker.onmessageerror = () => failLargeLoad("大文件 Worker 返回的数据无法读取");
  worker.postMessage({
    kind: "load-large-file",
    file,
    fileKind,
    delimiter: resolveImportDelimiter(file),
    headerRow: resolveImportHeaderRow(),
    encoding: els.encodingSelect.value,
    previewLimit: PREVIEW_LIMIT,
    longFieldThreshold: 50000,
  });
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
  updateSheetSelect([], "");
}

function normalizeExcelWorkerResult(result) {
  if (!result) return null;
  return {
    ...result,
    cellMeta: Array.isArray(result.cellMetaEntries) ? new Map(result.cellMetaEntries) : new Map(),
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
  if (state.excelWorker && requestExcelWorkerSheet(sheetName, startedAt, loadToken)) return;
  setProgress(0, "Excel Sheet Worker 不可用");
}

async function parseCsvFile(file) {
  if (shouldUseLargeTextDataPath(file)) {
    await parseLargeTextFile(file, "CSV");
    return;
  }
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
        fileLastModified: file.lastModified,
        delimiter: resolveImportDelimiter(file),
        headerRow: resolveImportHeaderRow(),
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
  if (shouldUseLargeTextDataPath(file)) {
    await parseLargeTextFile(file, "JSONL");
    return;
  }
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
        fileLastModified: file.lastModified,
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

async function startExcelWorkerParse(file, loadToken, startedAt) {
  if (!window.Worker) return false;
  try {
    const buffer = await file.arrayBuffer();
    if (!isCurrentLoad(loadToken)) return true;
    const worker = createExcelWorker();
    state.excelWorker = worker;
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
        worker.terminate();
        if (state.excelWorker === worker) state.excelWorker = null;
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
        file: { name: file.name, size: file.size, lastModified: file.lastModified },
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
    throw new Error("当前浏览器无法启动隔离的 Excel Worker");
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
  if (!confirmDatasetReplacement()) {
    if (els.fileInput) els.fileInput.value = "";
    return;
  }
  const lower = file.name.toLocaleLowerCase();
  els.fileHint.textContent = file.name;
  els.fileHint.title = file.name;
  state.sourceFileHandle = sourceFileHandle;
  els.searchInput.value = "";
  els.detailSearchInput.value = "";
  els.modalSearchInput.value = "";
  closeClipboardImportPopover();
  // 手动分隔符/表头行只对上一份文件成立，换文件一律回到自动
  resetImportOverrides();
  const isTextTable = !lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".jsonl");
  state.sourceTextFile = isTextTable ? file : null;
  setImportOverridesEnabled(isTextTable);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    parseExcelFile(file);
  } else if (lower.endsWith(".jsonl")) {
    parseJsonlFile(file);
  } else {
    parseCsvFile(file);
  }
}
