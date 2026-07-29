function getExportSplitCount() {
  const value = Math.floor(Number(els.exportSplitCountInput.value));
  const splitCount = Number.isFinite(value) && value > 0 ? value : 1;
  els.exportSplitCountInput.value = String(splitCount);
  return splitCount;
}

function getExportBaseName() {
  return state.file?.name ? state.file.name.replace(/\.[^.]+$/, "") : "filtered";
}

function getRowWindowSummary(rowWindow = state.rowWindow) {
  const normalized = normalizeRowWindow(rowWindow);
  if (normalized.mode === "first") return `当前保留前 ${normalized.count.toLocaleString()} 行`;
  if (normalized.mode === "range") {
    return `当前保留第 ${normalized.start.toLocaleString()}～${normalized.end.toLocaleString()} 行`;
  }
  return "当前保留全部结果";
}

function syncRowFilterDraftControls() {
  const mode = els.rowFilterModeSelect.value;
  els.rowFilterCountLabel.hidden = mode !== "first";
  els.rowFilterRangeFields.hidden = mode !== "range";
  els.rowFilterStatus.classList.remove("error");
  if (mode === "first") {
    const count = Math.floor(Number(els.rowFilterCountInput.value));
    els.rowFilterStatus.textContent = Number.isFinite(count) && count > 0
      ? `将保留当前结果的前 ${count.toLocaleString()} 行`
      : "请输入大于 0 的行数";
  } else if (mode === "range") {
    const start = Math.floor(Number(els.rowFilterStartInput.value));
    const end = Math.floor(Number(els.rowFilterEndInput.value));
    els.rowFilterStatus.textContent = Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start
      ? `将保留当前结果的第 ${start.toLocaleString()}～${end.toLocaleString()} 行`
      : "请输入有效范围，结束行不能小于起始行";
  } else {
    els.rowFilterStatus.textContent = "当前保留全部结果";
  }
}

function syncRowFilterControls() {
  const rowWindow = normalizeRowWindow(state.rowWindow);
  els.rowFilterModeSelect.value = rowWindow.mode;
  if (rowWindow.mode === "first") els.rowFilterCountInput.value = String(rowWindow.count);
  if (rowWindow.mode === "range") {
    els.rowFilterStartInput.value = String(rowWindow.start);
    els.rowFilterEndInput.value = String(rowWindow.end);
  }
  syncRowFilterDraftControls();
}

function closeRowFilterPopover() {
  els.rowFilterPopover.classList.remove("open");
  els.rowFilterButton.setAttribute("aria-expanded", "false");
}

function openRowFilterPopover(anchor = els.rowFilterButton) {
  if (els.rowFilterButton.disabled) return;
  closeClipboardImportPopover();
  closeAddColumnPopover();
  closeConcatenateColumnPopover();
  closeColumnFilterMenu();
  closeExportPopover();
  els.columnsPopover.classList.remove("open");
  els.columnsButton.setAttribute("aria-expanded", "false");
  syncRowFilterControls();
  els.rowFilterPopover.classList.add("open");
  els.rowFilterButton.setAttribute("aria-expanded", "true");
  const rect = anchor.getBoundingClientRect();
  const width = els.rowFilterPopover.offsetWidth || 360;
  const height = els.rowFilterPopover.offsetHeight || 330;
  els.rowFilterPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  els.rowFilterPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8))}px`;
  setPopoverTransformOrigin(els.rowFilterPopover, rect);
  els.rowFilterModeSelect.focus();
}

function applyRowFilter() {
  const mode = els.rowFilterModeSelect.value;
  let next = { mode: "all" };
  if (mode === "first") {
    const count = Math.floor(Number(els.rowFilterCountInput.value));
    if (!Number.isFinite(count) || count < 1) {
      els.rowFilterStatus.textContent = "请输入大于 0 的行数";
      els.rowFilterStatus.classList.add("error");
      return;
    }
    next = { mode: "first", count };
  } else if (mode === "range") {
    const start = Math.floor(Number(els.rowFilterStartInput.value));
    const end = Math.floor(Number(els.rowFilterEndInput.value));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
      els.rowFilterStatus.textContent = "请输入有效范围，结束行不能小于起始行";
      els.rowFilterStatus.classList.add("error");
      return;
    }
    next = { mode: "range", start, end };
  }
  state.rowWindow = next;
  recomputeView();
  closeRowFilterPopover();
  showToast(getRowWindowSummary(next));
}

function clearRowWindow() {
  state.rowWindow = { mode: "all" };
  recomputeView();
  if (els.rowFilterPopover.classList.contains("open")) syncRowFilterControls();
}

function updateExportPanel() {
  const rowCount = state.viewIndices.length;
  const columnCount = getVisibleColumnIndexes().length;
  const format = els.exportFormatSelect.value.toUpperCase();
  const splitCount = rowCount ? Math.min(getExportSplitCount(), rowCount) : 1;
  els.exportSummary.textContent = rowCount
    ? `将导出当前视图中的 ${rowCount.toLocaleString()} 行 × ${columnCount.toLocaleString()} 列。`
    : "当前视图没有可导出的行。";
  const extension = format === "XLSX" ? "xlsx" : "csv";
  const base = `${getExportBaseName()}-filtered`;
  els.exportFilenamePreview.textContent = splitCount > 1
    ? `${base}_part1.${extension} … ${base}_part${splitCount}.${extension}`
    : `${base}.${extension}`;
  els.exportCsvButton.disabled = !rowCount;
}

function closeExportPopover() {
  els.exportPopover.classList.remove("open");
  els.exportMenuButton.setAttribute("aria-expanded", "false");
}

function openExportPopover(anchor = els.exportMenuButton) {
  if (els.exportMenuButton.disabled) return;
  closeClipboardImportPopover();
  closeAddColumnPopover();
  closeConcatenateColumnPopover();
  closeColumnFilterMenu();
  closeRowFilterPopover();
  els.columnsPopover.classList.remove("open");
  els.columnsButton.setAttribute("aria-expanded", "false");
  updateExportPanel();
  els.exportPopover.classList.add("open");
  els.exportMenuButton.setAttribute("aria-expanded", "true");
  const rect = anchor.getBoundingClientRect();
  const width = els.exportPopover.offsetWidth || 360;
  const height = els.exportPopover.offsetHeight || 260;
  els.exportPopover.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
  els.exportPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8))}px`;
  setPopoverTransformOrigin(els.exportPopover, rect);
  els.exportFormatSelect.focus();
}

function getFilteredExportRowGroups() {
  const rowIndexes = [...state.viewIndices];
  if (!rowIndexes.length) return [];
  const splitCount = Math.min(getExportSplitCount(), rowIndexes.length);
  const rowsPerPart = Math.ceil(rowIndexes.length / splitCount);
  const groups = [];
  for (let index = 0; index < rowIndexes.length; index += rowsPerPart) {
    groups.push(rowIndexes.slice(index, index + rowsPerPart));
  }
  return groups;
}

async function exportFilteredCsv(rowIndexes = state.viewIndices, suffix = "") {
  if (!state.rows.length) return;
  const visibleColumns = getVisibleColumnIndexes();
  const parts = [visibleColumns.map((col) => escapeCsv(state.headers[col])).join(",")];
  let chunk = [];
  for (const rowIndex of rowIndexes) {
    const row = state.rows[rowIndex];
    chunk.push("\r\n", visibleColumns.map((col) => escapeCsv(row[col] || "")).join(","));
    if (chunk.length >= 2000) {
      parts.push(chunk.join(""));
      chunk = [];
    }
  }
  if (chunk.length) parts.push(chunk.join(""));
  const base = state.file?.name ? state.file.name.replace(/\.[^.]+$/, "") : "filtered";
  await saveTextFile(`${base}-filtered${suffix}.csv`, parts);
}

function getFilteredExportMatrix(rowIndexes = state.viewIndices) {
  const visibleColumns = getVisibleColumnIndexes();
  const matrix = [visibleColumns.map((col) => state.headers[col])];
  for (const rowIndex of rowIndexes) {
    const row = state.rows[rowIndex];
    matrix.push(visibleColumns.map((col) => row[col] || ""));
  }
  return matrix;
}

async function exportFilteredXlsx(rowIndexes = state.viewIndices, suffix = "") {
  if (!state.rows.length) return;
  const XLSX = await ensureSheetJs();
  const matrix = getFilteredExportMatrix(rowIndexes);
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Filtered");
  const base = state.file?.name ? state.file.name.replace(/\.[^.]+$/, "") : "filtered";
  XLSX.writeFile(workbook, `${base}-filtered${suffix}.xlsx`);
  els.leftStatus.textContent = "已导出 XLSX 文件";
}

async function exportFilteredTable() {
  try {
    const rowGroups = getFilteredExportRowGroups();
    if (!rowGroups.length) {
      els.leftStatus.textContent = "当前筛选结果为空，未导出文件";
      showToast("当前视图没有可导出的行", { tone: "error" });
      return;
    }
    for (let partIndex = 0; partIndex < rowGroups.length; partIndex += 1) {
      const suffix = rowGroups.length > 1 ? `_part${partIndex + 1}` : "";
      if (els.exportFormatSelect.value === "xlsx") {
        await exportFilteredXlsx(rowGroups[partIndex], suffix);
      } else {
        await exportFilteredCsv(rowGroups[partIndex], suffix);
      }
    }
    const message = rowGroups.length > 1
      ? `已导出 ${rowGroups.length} 个拆分文件`
      : `已导出 ${state.viewIndices.length.toLocaleString()} 行 ${els.exportFormatSelect.value.toUpperCase()}`;
    els.leftStatus.textContent = message;
    closeExportPopover();
    showToast(message);
  } catch (error) {
    els.leftStatus.textContent = `导出失败：${error.message}`;
    showToast(`导出失败：${error.message}`, { tone: "error" });
  }
}
