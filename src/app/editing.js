function getDatasetRecoveryKey(file = state.file) {
  if (!file || !Number.isFinite(Number(file.lastModified))) return "";
  return [file.kind || "Table", file.name || "", file.size || 0, Number(file.lastModified), file.delimiter || ""].join("|");
}

function getRecoveryDraftChanges() {
  const changes = new Map();
  state.editedCells.forEach((originalValue, key) => {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    if (!hasDataRowIndex(rowIndex) || !Number.isInteger(columnIndex)) return;
    changes.set(key, {
      rowIndex,
      columnIndex,
      value: String(getDataCellValue(rowIndex, columnIndex) ?? ""),
    });
  });
  if (hasPendingCellEditChange()) {
    const edit = state.cellEdit;
    changes.set(getCellKey(edit.rowIndex, edit.columnIndex), {
      rowIndex: edit.rowIndex,
      columnIndex: edit.columnIndex,
      value: String(edit.value ?? ""),
    });
  }
  return [...changes.values()];
}

function hasWorkspaceRecoveryChanges() {
  return getRecoveryDraftChanges().length > 0;
}

function createRecoveryDraftSnapshot() {
  const key = state.datasetRecoveryKey;
  const changes = getRecoveryDraftChanges();
  if (!key || !changes.length) return null;
  return {
    key,
    version: 1,
    savedAt: Date.now(),
    file: {
      name: state.file?.name || "",
      kind: state.file?.kind || "",
      delimiter: state.file?.delimiter || "",
    },
    changes,
  };
}

function getRecoveryDraftSessionKey(key) {
  return `${RECOVERY_DRAFT_SESSION_PREFIX}${key}`;
}

function readRecoveryDraftFromSession(key) {
  try {
    const raw = sessionStorage.getItem(getRecoveryDraftSessionKey(key));
    const draft = raw ? JSON.parse(raw) : null;
    return draft?.key === key && Array.isArray(draft.changes) ? draft : null;
  } catch {
    return null;
  }
}

function writeRecoveryDraftToSession(draft) {
  try {
    sessionStorage.setItem(getRecoveryDraftSessionKey(draft.key), JSON.stringify(draft));
  } catch {
    // IndexedDB remains available as the larger best-effort recovery store.
  }
}

function clearRecoveryDraftFromSession(key) {
  try {
    sessionStorage.removeItem(getRecoveryDraftSessionKey(key));
  } catch {
    // Storage can be disabled in private or restricted contexts.
  }
}

function openRecoveryDraftDatabase() {
  if (!window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(RECOVERY_DRAFT_DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECOVERY_DRAFT_STORE)) {
        database.createObjectStore(RECOVERY_DRAFT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地恢复草稿"));
  });
}

async function readRecoveryDraftFromIndexedDb(key) {
  const database = await openRecoveryDraftDatabase();
  if (!database) return null;
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(RECOVERY_DRAFT_STORE, "readonly").objectStore(RECOVERY_DRAFT_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("无法读取本地恢复草稿"));
    });
  } finally {
    database.close();
  }
}

async function writeRecoveryDraftToIndexedDb(draft) {
  const database = await openRecoveryDraftDatabase();
  if (!database) return;
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(RECOVERY_DRAFT_STORE, "readwrite").objectStore(RECOVERY_DRAFT_STORE).put(draft);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("无法保存本地恢复草稿"));
    });
  } finally {
    database.close();
  }
}

async function deleteRecoveryDraftFromIndexedDb(key) {
  const database = await openRecoveryDraftDatabase();
  if (!database) return;
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(RECOVERY_DRAFT_STORE, "readwrite").objectStore(RECOVERY_DRAFT_STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("无法删除本地恢复草稿"));
    });
  } finally {
    database.close();
  }
}

function persistRecoveryDraft(draft) {
  writeRecoveryDraftToSession(draft);
  writeRecoveryDraftToIndexedDb(draft).catch(() => {});
}

function clearRecoveryDraft(key = state.datasetRecoveryKey) {
  if (!key) return;
  clearRecoveryDraftFromSession(key);
  deleteRecoveryDraftFromIndexedDb(key).catch(() => {});
}

function handleBeforeUnload(event) {
  if (!hasWorkspaceRecoveryChanges()) return;
  flushRecoveryDraft();
  event.preventDefault();
  event.returnValue = "";
}

function syncPageLeaveGuard() {
  const shouldGuard = hasWorkspaceRecoveryChanges();
  if (shouldGuard === state.hasBeforeUnloadGuard) return;
  state.hasBeforeUnloadGuard = shouldGuard;
  if (shouldGuard) window.addEventListener("beforeunload", handleBeforeUnload);
  else window.removeEventListener("beforeunload", handleBeforeUnload);
}

function flushRecoveryDraft() {
  if (state.recoveryDraftSaveTimer) {
    clearTimeout(state.recoveryDraftSaveTimer);
    state.recoveryDraftSaveTimer = 0;
  }
  const draft = createRecoveryDraftSnapshot();
  if (draft) persistRecoveryDraft(draft);
  else clearRecoveryDraft();
  syncPageLeaveGuard();
}

function scheduleRecoveryDraftSave() {
  syncPageLeaveGuard();
  if (state.recoveryDraftSaveTimer) clearTimeout(state.recoveryDraftSaveTimer);
  const datasetRecoveryKey = state.datasetRecoveryKey;
  state.recoveryDraftSaveTimer = window.setTimeout(() => {
    state.recoveryDraftSaveTimer = 0;
    if (datasetRecoveryKey !== state.datasetRecoveryKey) return;
    flushRecoveryDraft();
  }, RECOVERY_DRAFT_SAVE_DELAY);
}

function closeRecoveryDraftDialog() {
  if (els.recoveryDraftBackdrop.classList.contains("open")) closeManagedDialog(els.recoveryDraftBackdrop);
  state.pendingRecoveryDraft = null;
}

async function checkForRecoveryDraft() {
  const key = state.datasetRecoveryKey;
  if (!key || hasWorkspaceRecoveryChanges()) return;
  const token = state.recoveryDraftCheckToken + 1;
  state.recoveryDraftCheckToken = token;
  const sessionDraft = readRecoveryDraftFromSession(key);
  let indexedDraft = null;
  try {
    indexedDraft = await readRecoveryDraftFromIndexedDb(key);
  } catch {
    // Session storage still provides same-tab recovery when IndexedDB is unavailable.
  }
  if (token !== state.recoveryDraftCheckToken || key !== state.datasetRecoveryKey) return;
  const draft = [sessionDraft, indexedDraft]
    .filter((item) => item?.key === key && Array.isArray(item.changes) && item.changes.length)
    .sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0))[0];
  if (!draft) return;
  state.pendingRecoveryDraft = draft;
  els.recoveryDraftSummary.textContent = `检测到此文件有 ${draft.changes.length.toLocaleString()} 个未保存的 cell 编辑。草稿仅保存在当前浏览器，不包含完整源文件。`;
  openManagedDialog(els.recoveryDraftBackdrop, els.restoreRecoveryDraftButton);
}

function restoreRecoveryDraft() {
  const draft = state.pendingRecoveryDraft;
  if (!draft || draft.key !== state.datasetRecoveryKey) return;
  const changes = [];
  for (const change of draft.changes) {
    if (!Number.isInteger(change.rowIndex) || !Number.isInteger(change.columnIndex)) continue;
    const changed = setCellValue(change.rowIndex, change.columnIndex, change.value, {
      recordHistory: false,
      invalidateCache: false,
      refreshIssues: false,
    });
    if (changed) changes.push(change);
  }
  if (changes.length) {
    refreshAfterCellValueBatchChange(changes);
    els.leftStatus.textContent = `已恢复 ${changes.length.toLocaleString()} 个未保存编辑`;
  } else {
    syncEditSummary();
    els.leftStatus.textContent = "恢复草稿中没有需要应用的编辑";
  }
  closeRecoveryDraftDialog();
  scheduleRecoveryDraftSave();
}

function discardRecoveryDraft() {
  const key = state.pendingRecoveryDraft?.key || state.datasetRecoveryKey;
  clearRecoveryDraft(key);
  closeRecoveryDraftDialog();
  els.leftStatus.textContent = "已丢弃本地恢复草稿";
}

function confirmDatasetReplacement() {
  if (!hasWorkspaceRecoveryChanges()) return true;
  flushRecoveryDraft();
  return window.confirm("当前文件有未保存的编辑。继续加载新文件吗？这些编辑会保留为本浏览器中的恢复草稿。");
}

function selectCell(rowIndex, columnIndex) {
  if (!setFocusedCell(rowIndex, columnIndex)) return;
  clearSelectionToSelected();
  ensureCellVisible(rowIndex, columnIndex);
  renderGrid();
  renderDetail();
  prefetchLargeCell(rowIndex, columnIndex);
}

function getSelectedValue() {
  if (!state.selected) return "";
  return getDataCellValue(state.selected.rowIndex, state.selected.columnIndex) ?? "";
}

function selectionIncludesHeaders(range = state.selectionRange) {
  if (!range) return false;
  return range.type === "columns" || range.type === "all";
}

function buildClipboardHtmlRow(cells, tagName = "td") {
  const cellsHtml = cells
    .map((cell) => {
      const rawText = String(cell == null ? "" : cell);
      const html = escapeHtml(rawText).replace(/\r\n|\r|\n/g, '<br style="mso-data-placement:same-cell;">');
      const sheetsValue = escapeHtml(JSON.stringify({ 1: 2, 2: rawText }));
      return `<${tagName} data-sheets-value="${sheetsValue}" style="mso-number-format:'\\@';white-space:pre-wrap;">${html}</${tagName}>`;
    })
    .join("");
  return `<tr>${cellsHtml}</tr>`;
}

async function getSelectionCopyPayload() {
  const endpoints = getSelectionEndpoints();
  if (!endpoints) {
    let value = getSelectedValue();
    if (state.selected && isLargeDataMode() && getDataCellValue(state.selected.rowIndex, state.selected.columnIndex) === undefined) {
      const cell = await requestLargeCell(state.selected.rowIndex, state.selected.columnIndex);
      value = cell?.value || "";
    }
    return {
      plainText: formatPlainClipboardCell(value),
      html: `<table><tbody>${buildClipboardHtmlRow([value])}</tbody></table>`,
    };
  }

  const columns = getVisibleColumnIndexes().slice(endpoints.startColumnPosition, endpoints.endColumnPosition + 1);
  const plainRows = [];
  const htmlRows = [];
  if (selectionIncludesHeaders()) {
    const headers = columns.map((columnIndex) => state.headers[columnIndex] || "");
    plainRows.push(headers.map(formatPlainClipboardCell).join("\t"));
    htmlRows.push(buildClipboardHtmlRow(headers, "th"));
  }
  const selectedRowIndexes = state.viewIndices.slice(endpoints.startRowPosition, endpoints.endRowPosition + 1);
  if (isLargeDataMode() && !canRunLargeExpensiveOperation() && selectedRowIndexes.length > LARGE_CLIPBOARD_MAX_ROWS) {
    throw new Error(`超大文件一次最多复制 ${LARGE_CLIPBOARD_MAX_ROWS} 行；请缩小选区或使用流式 CSV 导出`);
  }
  const largeRows = isLargeDataMode() ? await getLargeDataRows(selectedRowIndexes) : null;
  for (let rowPosition = endpoints.startRowPosition; rowPosition <= endpoints.endRowPosition; rowPosition += 1) {
    const row = largeRows
      ? largeRows[rowPosition - endpoints.startRowPosition]
      : getDataRow(state.viewIndices[rowPosition]);
    const cells = columns.map((columnIndex) => row?.[columnIndex] || "");
    plainRows.push(cells.map(formatPlainClipboardCell).join("\t"));
    htmlRows.push(buildClipboardHtmlRow(cells));
  }
  return {
    plainText: plainRows.join("\r\n"),
    html: `<table><tbody>${htmlRows.join("")}</tbody></table>`,
  };
}

async function copySelection() {
  try {
    return await copyClipboardPayload(await getSelectionCopyPayload());
  } catch (error) {
    els.leftStatus.textContent = `复制失败：${error.message}`;
    return false;
  }
}

function parseClipboardTable(text) {
  const source = String(text ?? "").replace(/(?:\r\n|\r|\n)$/, "");
  if (!source) return [];
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === "\t") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (ch === "\r" || ch === "\n")) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && source[index + 1] === "\n") index += 1;
      continue;
    }

    field += ch;
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function getPastedColumnCount(rows) {
  let count = 0;
  for (const row of rows) {
    if (row.length > count) count = row.length;
  }
  return count;
}

function buildClipboardHeaders(rawHeaders, columnCount) {
  return Array.from({ length: columnCount }, (_, index) => {
    const value = rawHeaders[index] == null || rawHeaders[index] === "" ? `Column ${index + 1}` : rawHeaders[index];
    return String(value);
  });
}

function buildClipboardDataset(text, firstRowAsHeader) {
  const startedAt = Date.now();
  const rows = parseClipboardTable(text).filter((row) =>
    row.some((cell) => String(cell == null ? "" : cell).trim() !== ""),
  );
  const columnCount = getPastedColumnCount(rows);
  if (!rows.length || !columnCount) throw new Error("剪贴板中没有可导入的表格数据");
  const rawHeaders = firstRowAsHeader ? rows[0] : [];
  const sourceRows = firstRowAsHeader ? rows.slice(1) : rows;
  const headers = buildClipboardHeaders(rawHeaders, columnCount);
  const normalizedRows = sourceRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => (row[index] == null ? "" : String(row[index]))),
  );
  return {
    headers,
    rows: normalizedRows,
    issues: analyzeRows(headers, normalizedRows),
    file: {
      name: "剪贴板表格",
      size: String(text || "").length,
      encoding: "Clipboard",
      delimiter: "Tab",
      parseMs: Date.now() - startedAt,
      kind: "Clipboard",
    },
  };
}

async function readClipboardText() {
  if (!navigator.clipboard?.readText) throw new Error("当前浏览器不支持读取剪贴板，请改用文件导入");
  return navigator.clipboard.readText();
}

function updateClipboardImportButton() {
  els.clipboardImportButton.disabled = Boolean(state.headers.length || state.rows.length);
  els.clipboardImportButton.title = els.clipboardImportButton.disabled
    ? "已载入数据；如需从剪贴板导入，请刷新页面"
    : "从剪贴板导入表格";
}

function openClipboardImportPopover(anchor) {
  if (state.headers.length || state.rows.length) {
    els.leftStatus.textContent = "已载入数据；如需从剪贴板导入，请刷新页面";
    return;
  }
  els.clipboardFirstRowHeaderInput.checked = true;
  const rect = anchor.getBoundingClientRect();
  els.clipboardImportPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
  els.clipboardImportPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 220))}px`;
  els.columnsPopover.classList.remove("open");
  els.columnsButton.setAttribute("aria-expanded", "false");
  closeAddColumnPopover();
  closeConcatenateColumnPopover();
  closeColumnFilterMenu();
  closeContextMenu();
  els.clipboardImportPopover.classList.add("open");
  els.clipboardImportButton.setAttribute("aria-expanded", "true");
  setPopoverTransformOrigin(els.clipboardImportPopover, rect);
  els.confirmClipboardImportButton.focus();
}

function closeClipboardImportPopover() {
  els.clipboardImportPopover.classList.remove("open");
  els.clipboardImportButton.setAttribute("aria-expanded", "false");
}

async function importClipboardTable() {
  if (state.headers.length || state.rows.length) {
    els.leftStatus.textContent = "已载入数据；如需从剪贴板导入，请刷新页面";
    return;
  }
  const loadToken = beginLoad();
  resetExcelWorkbook();
  try {
    const text = await readClipboardText();
    if (!isCurrentLoad(loadToken)) return;
    const dataset = buildClipboardDataset(text, els.clipboardFirstRowHeaderInput.checked);
    state.sourceFileHandle = null;
    setDataset(dataset);
    els.fileHint.textContent = dataset.file.name;
    els.fileHint.title = "从剪贴板导入的表格";
    closeClipboardImportPopover();
    els.leftStatus.textContent = `已从剪贴板导入 ${dataset.rows.length.toLocaleString()} 行 × ${dataset.headers.length.toLocaleString()} 列`;
  } catch (error) {
    if (!isCurrentLoad(loadToken)) return;
    els.leftStatus.textContent = `剪贴板导入失败：${error.message}`;
  }
}

function pasteClipboardTextIntoSelection(text) {
  const pastedRows = parseClipboardTable(text);
  const pastedColumnCount = getPastedColumnCount(pastedRows);
  if (!pastedRows.length || !pastedColumnCount) return false;
  if (!state.selected) {
    els.leftStatus.textContent = "请先选中一个自定义列单元格再粘贴";
    return true;
  }

  const visibleColumns = getVisibleColumnIndexes();
  const startRowPosition = getVisibleRowPosition(state.selected.rowIndex);
  const startColumnPosition = visibleColumns.indexOf(state.selected.columnIndex);
  if (startRowPosition < 0 || startColumnPosition < 0) {
    els.leftStatus.textContent = "当前选区不可粘贴";
    return true;
  }

  const targetColumns = visibleColumns.slice(startColumnPosition, startColumnPosition + pastedColumnCount);
  if (targetColumns.length < pastedColumnCount) {
    els.leftStatus.textContent = "粘贴区域超出可见列，请先新增或显示足够的自定义列";
    return true;
  }

  if (!targetColumns.every((columnIndex) => isCustomColumn(columnIndex))) {
    els.leftStatus.textContent = "只能向自定义列粘贴，原始导入列不可修改";
    return true;
  }

  const writableRowCount = Math.min(pastedRows.length, state.viewIndices.length - startRowPosition);
  if (writableRowCount <= 0) {
    els.leftStatus.textContent = "粘贴区域超出当前可见行";
    return true;
  }

  const anchor = { ...state.selected };
  const changes = [];
  for (let rowOffset = 0; rowOffset < writableRowCount; rowOffset += 1) {
    const rowIndex = state.viewIndices[startRowPosition + rowOffset];
    for (let columnOffset = 0; columnOffset < pastedColumnCount; columnOffset += 1) {
      const columnIndex = targetColumns[columnOffset];
      const previousValue = String(getDataCellValue(rowIndex, columnIndex) ?? "");
      const nextValue = String(pastedRows[rowOffset]?.[columnOffset] ?? "");
      const changed = setCellValue(rowIndex, columnIndex, nextValue, {
        recordHistory: false,
        invalidateCache: false,
        refreshIssues: false,
      });
      if (changed) {
        changes.push({ rowIndex, columnIndex, previousValue, nextValue });
      }
    }
  }

  const endRowIndex = state.viewIndices[startRowPosition + writableRowCount - 1];
  const endColumnIndex = targetColumns[targetColumns.length - 1];
  selectCellRange(anchor.rowIndex, anchor.columnIndex, endRowIndex, endColumnIndex, { silent: true });
  if (changes.length) {
    pushEditHistory({ type: "cell-batch-value", changes });
    refreshAfterCellValueBatchChange(changes);
  } else {
    renderGrid();
    renderDetail();
    syncEditSummary();
  }

  const truncatedRows = pastedRows.length - writableRowCount;
  const baseStatus = `已粘贴 ${writableRowCount.toLocaleString()} 行 × ${pastedColumnCount.toLocaleString()} 列`;
  const changeStatus = changes.length ? `，变更 ${changes.length.toLocaleString()} 个 cell` : "，内容未变化";
  els.leftStatus.textContent = truncatedRows > 0
    ? `${baseStatus}${changeStatus}，超出 ${truncatedRows.toLocaleString()} 行未写入`
    : `${baseStatus}${changeStatus}`;
  return true;
}

function getLineCount(text) {
  if (!text) return 0;
  return String(text).split(/\r\n|\r|\n/).length;
}

function countOccurrences(text, query, caseSensitive) {
  if (!query) return 0;
  const haystack = normalizeForSearch(text, caseSensitive);
  const needle = normalizeForSearch(query, caseSensitive);
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  let found = haystack.indexOf(needle, offset);
  while (found >= 0) {
    count += 1;
    offset = found + needle.length;
    found = haystack.indexOf(needle, offset);
    if (count > 100000) break;
  }
  return count;
}

function renderTextContent(container, value, query, limit, meta = null, start = 0) {
  const text = value == null ? "" : String(value);
  const shown = text.slice(start, start + limit);
  renderCellDisplayContent(container, shown, query, meta, {
    allowHtml: Boolean(meta?.html) && shown.length === text.length,
  });
  if (start > 0 || start + shown.length < text.length) {
    const tail = document.createElement("div");
    tail.style.marginTop = "12px";
    tail.style.color = "var(--muted)";
    tail.textContent = `已显示 ${(start + 1).toLocaleString()}～${(start + shown.length).toLocaleString()} / ${text.length.toLocaleString()} 字符`;
    container.appendChild(tail);
  }
}

function looksLikeJson(text) {
  const value = String(text || "").trim();
  if (!/^[\[{]/.test(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return false;
  }
}

function looksLikeHtml(text) {
  const value = String(text || "").trim();
  return /<\/?[a-z][\s\S]*>/i.test(value) && /<[a-z][^>]*>/i.test(value);
}

function looksLikeMarkdown(text) {
  const value = String(text || "");
  return /(^|\n)#{1,6}\s+\S/.test(value) ||
    /(^|\n)```/.test(value) ||
    /(^|\n)\s*[-*+]\s+\S/.test(value) ||
    /(^|\n)>\s+\S/.test(value) ||
    /(^|\n)\|.+\|/.test(value);
}

function looksLikeCode(text) {
  const value = String(text || "");
  const lines = value.split(/\r\n|\r|\n/);
  if (lines.length < 2) return false;
  return /\b(function|const|let|var|class|return|import|export|def|SELECT|FROM|WHERE)\b/.test(value) ||
    /[{};]\s*(\r\n|\r|\n)/.test(value) ||
    lines.filter((line) => /^\s{2,}\S/.test(line)).length >= 2;
}

function detectModalFormat(text, meta = null) {
  if (meta?.html) return "html";
  if (looksLikeJson(text)) return "json";
  if (looksLikeHtml(text)) return "html";
  if (looksLikeMarkdown(text)) return "markdown";
  if (looksLikeCode(text)) return "code";
  return "plain";
}

function resolveModalFormat(text, meta = null) {
  const selected = els.modalFormatSelect.value || "auto";
  return selected === "auto" ? detectModalFormat(text, meta) : selected;
}

function showModalParseError(message) {
  const box = document.createElement("div");
  box.className = "modal-parse-error";
  box.textContent = message;
  els.modalParsedContent.appendChild(box);
}

function appendCodeBlock(parent, text, className = "modal-code-block") {
  const pre = document.createElement("pre");
  pre.className = className;
  const code = document.createElement("code");
  code.textContent = String(text || "");
  pre.appendChild(code);
  parent.appendChild(pre);
}

function appendJsonPrimitive(parent, value) {
  const span = document.createElement("span");
  if (typeof value === "string") {
    span.className = "json-string";
    span.textContent = JSON.stringify(value);
  } else if (typeof value === "number") {
    span.className = "json-number";
    span.textContent = String(value);
  } else if (typeof value === "boolean") {
    span.className = "json-boolean";
    span.textContent = String(value);
  } else {
    span.className = "json-null";
    span.textContent = "null";
  }
  parent.appendChild(span);
  if (typeof value === "string" && looksLikeMarkdown(value)) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "json-markdown-toggle";
    toggle.textContent = "解析 Markdown";
    toggle.setAttribute("aria-expanded", "false");
    const preview = document.createElement("div");
    preview.className = "json-markdown-preview";
    preview.hidden = true;
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      if (expanded) {
        preview.hidden = true;
        toggle.textContent = "解析 Markdown";
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      if (!preview.dataset.rendered) {
        renderMarkdownPreview(value, preview);
        preview.dataset.rendered = "true";
      }
      preview.hidden = false;
      toggle.textContent = "收起 Markdown";
      toggle.setAttribute("aria-expanded", "true");
    });
    parent.appendChild(toggle);
    parent.appendChild(preview);
  }
}

function appendJsonKey(parent, key) {
  if (key === "") return;
  const keySpan = document.createElement("span");
  keySpan.className = "json-key";
  keySpan.textContent = `${JSON.stringify(key)}: `;
  parent.appendChild(keySpan);
}

function appendJsonValue(parent, key, value, budget) {
  if (budget.count >= budget.limit) {
    if (!budget.truncated) {
      const note = document.createElement("div");
      note.className = "muted";
      note.textContent = `JSON 节点超过 ${budget.limit.toLocaleString()} 个，右侧已截断显示`;
      parent.appendChild(note);
      budget.truncated = true;
    }
    return;
  }
  budget.count += 1;

  if (value && typeof value === "object") {
    const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
    const details = document.createElement("details");
    details.open = budget.count < 80;
    const summary = document.createElement("summary");
    appendJsonKey(summary, key);
    summary.appendChild(document.createTextNode(Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`));
    details.appendChild(summary);
    for (const [childKey, childValue] of entries) {
      appendJsonValue(details, childKey, childValue, budget);
    }
    parent.appendChild(details);
    return;
  }

  const row = document.createElement("div");
  appendJsonKey(row, key);
  appendJsonPrimitive(row, value);
  parent.appendChild(row);
}

function renderJsonPreview(text) {
  try {
    const parsed = JSON.parse(String(text || ""));
    const root = document.createElement("div");
    root.className = "json-viewer-root";
    appendJsonValue(root, "", parsed, { count: 0, limit: 2000, truncated: false });
    els.modalParsedContent.appendChild(root);
  } catch (error) {
    showModalParseError(`JSON 解析失败：${error.message}`);
    appendCodeBlock(els.modalParsedContent, text);
  }
}

function renderMarkdownInlineHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function appendMarkdownInline(parent, text) {
  const span = document.createElement("span");
  span.innerHTML = renderMarkdownInlineHtml(text);
  parent.appendChild(span);
}

function renderMarkdownPreview(text, target = els.modalParsedContent) {
  const root = document.createElement("div");
  root.className = "markdown-preview";
  const lines = String(text || "").split(/\r\n|\r|\n/);
  let list = null;
  let listType = "";
  let codeFence = "";
  let codeLines = [];

  const closeList = () => {
    list = null;
    listType = "";
  };

  const ensureList = (type) => {
    if (!list || listType !== type) {
      closeList();
      list = document.createElement(type);
      listType = type;
      root.appendChild(list);
    }
    return list;
  };

  const flushCode = () => {
    appendCodeBlock(root, codeLines.join("\n"));
    codeLines = [];
    codeFence = "";
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*(.*)$/);
    if (fence) {
      closeList();
      if (codeFence) flushCode();
      else codeFence = fence[1] || "code";
      continue;
    }
    if (codeFence) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(3, heading[1].length);
      const title = document.createElement(`h${level}`);
      appendMarkdownInline(title, heading[2]);
      root.appendChild(title);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      const blockquote = document.createElement("blockquote");
      appendMarkdownInline(blockquote, quote[1]);
      root.appendChild(blockquote);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const target = ensureList(unordered ? "ul" : "ol");
      const item = document.createElement("li");
      appendMarkdownInline(item, unordered ? unordered[1] : ordered[1]);
      target.appendChild(item);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    closeList();
    const paragraph = document.createElement("p");
    appendMarkdownInline(paragraph, line);
    root.appendChild(paragraph);
  }

  if (codeFence) flushCode();
  target.appendChild(root);
}

function sanitizeHtmlDocumentForPreview(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta, base").forEach((node) => node.remove());
  for (const element of doc.body.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
      } else if (["src", "srcset", "poster", "action"].includes(name)) {
        element.removeAttribute(attribute.name);
      } else if (["href", "xlink:href"].includes(name) && !value.trim().startsWith("#")) {
        element.removeAttribute(attribute.name);
      } else if (name === "style") {
        const style = sanitizeStyleAttribute(value);
        if (style) element.setAttribute("style", style);
        else element.removeAttribute(attribute.name);
      }
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:12px;font:14px/1.55 system-ui,sans-serif;color:#111827;}*{box-sizing:border-box;max-width:100%;}</style></head><body>${doc.body.innerHTML}</body></html>`;
}

function renderHtmlPreview(text) {
  const frame = document.createElement("iframe");
  frame.className = "html-preview-frame";
  frame.setAttribute("sandbox", "");
  frame.srcdoc = sanitizeHtmlDocumentForPreview(text);
  els.modalParsedContent.appendChild(frame);
}

function renderModalParsedContent(text, format, meta = null) {
  els.modalParsedContent.className = "modal-content modal-parsed-content";
  els.modalParsedContent.innerHTML = "";
  applyCellMetaStyle(els.modalParsedContent, null);
  if (format === "json") {
    renderJsonPreview(text);
  } else if (format === "markdown") {
    renderMarkdownPreview(text);
  } else if (format === "html") {
    renderHtmlPreview(meta?.html || text);
  } else if (format === "code") {
    appendCodeBlock(els.modalParsedContent, text);
  } else {
    appendLinkedText(els.modalParsedContent, text, "");
  }
}

function isEditingSelectedCell() {
  const edit = state.cellEdit;
  const selected = state.selected;
  return Boolean(
    edit &&
      selected &&
      edit.rowIndex === selected.rowIndex &&
      edit.columnIndex === selected.columnIndex,
  );
}

function hasPendingCellEditChange() {
  const edit = state.cellEdit;
  if (!edit) return false;
  const currentValue = String(getDataCellValue(edit.rowIndex, edit.columnIndex) ?? "");
  return String(edit.value ?? "") !== currentValue;
}

function syncCellEditControls(hasSelection, isEditing) {
  els.detailSearchInput.disabled = isEditing;
  els.copyCellButton.disabled = !hasSelection || isEditing;
  els.openModalButton.disabled = !hasSelection || isEditing;
  els.editCellButton.disabled = !hasSelection || isEditing;
  els.highlightMenuButton.disabled = !hasSelection || isEditing;
  els.highlightYellowOption.disabled = !hasSelection || isEditing;
  els.highlightBlueOption.disabled = !hasSelection || isEditing;
  els.highlightPinkOption.disabled = !hasSelection || isEditing;
  els.clearHighlightOption.disabled = !hasSelection || isEditing;
  els.editCellButton.hidden = isEditing;
  els.saveCellEditButton.hidden = !isEditing;
  els.cancelCellEditButton.hidden = !isEditing;
  els.saveCellEditButton.disabled = !isEditing;
}

function renderCellEditor() {
  const edit = state.cellEdit;
  els.detailContent.innerHTML = "";
  applyCellMetaStyle(els.detailContent, null);
  const textarea = document.createElement("textarea");
  textarea.id = "cellEditTextarea";
  textarea.className = "detail-edit-textarea";
  textarea.value = edit?.value ?? "";
  textarea.addEventListener("input", () => {
    if (state.cellEdit) state.cellEdit.value = textarea.value;
    els.detailStatus.textContent = `${textarea.value.length.toLocaleString()} 字符 · 编辑中`;
    scheduleRecoveryDraftSave();
  });
  textarea.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      saveCellEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCellEdit();
    }
  });
  els.detailContent.appendChild(textarea);
  requestAnimationFrame(() => textarea.focus());
}

function beginCellEdit() {
  if (!state.selected) return;
  if (isLargeDataMode() && !getDataRow(state.selected.rowIndex)) {
    els.leftStatus.textContent = "正在读取单元格内容…";
    prefetchLargeRows([state.selected.rowIndex]);
    return;
  }
  state.cellEdit = {
    rowIndex: state.selected.rowIndex,
    columnIndex: state.selected.columnIndex,
    value: getSelectedValue(),
  };
  state.detailVisibleChars = DETAIL_CHUNK;
  state.detailVisibleStart = 0;
  renderDetail();
}

function cancelCellEdit() {
  if (!state.cellEdit) return;
  state.cellEdit = null;
  scheduleRecoveryDraftSave();
  renderDetail();
}

function setCellValue(rowIndex, columnIndex, value, options = {}) {
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return false;
  const row = getDataRow(rowIndex);
  if ((!row && !isLargeDataMode()) || !hasDataRowIndex(rowIndex) || columnIndex < 0 || columnIndex >= state.headers.length) return false;
  const nextValue = String(value ?? "");
  const currentValue = String(getDataCellValue(rowIndex, columnIndex) ?? "");
  if (currentValue === nextValue) return false;
  const key = getCellKey(rowIndex, columnIndex);
  const originalValue = state.editedCells.has(key)
    ? getEditedCellOriginalValue(rowIndex, columnIndex)
    : currentValue;
  if (isLargeDataMode() && row) row[columnIndex] = nextValue;
  else state.rows[rowIndex][columnIndex] = nextValue;
  if (isLargeDataMode()) syncLargePreviewAfterCellChange(rowIndex, columnIndex, nextValue);
  touchCellVersion(rowIndex, columnIndex);
  syncEditedCellTracking(rowIndex, columnIndex, originalValue, nextValue);
  if (state.cellMeta?.size) state.cellMeta.delete(`${rowIndex}:${columnIndex}`);
  if (options.invalidateCache !== false) {
    invalidateColumnValueCache(columnIndex);
    invalidateColumnProfileCache(columnIndex);
  }
  if (options.refreshIssues !== false) refreshIssuesAfterCellEdits(new Set([rowIndex]));
  if (options.recordHistory !== false) {
    pushEditHistory({
      type: "cell-value",
      rowIndex,
      columnIndex,
      previousValue: currentValue,
      nextValue,
    });
  }
  scheduleRecoveryDraftSave();
  return true;
}

function refreshAfterCellValueBatchChange(changes) {
  if (!changes.length) {
    syncEditSummary();
    return;
  }
  const touchedRows = new Set();
  const touchedColumns = new Set();
  for (const change of changes) {
    touchedRows.add(change.rowIndex);
    touchedColumns.add(change.columnIndex);
  }
  for (const columnIndex of touchedColumns) {
    invalidateColumnValueCache(columnIndex);
    invalidateColumnProfileCache(columnIndex);
  }
  refreshIssuesAfterCellEdits(touchedRows);
  patchQueryWorkerCells(changes);
  recomputeView();
  updateFileStats();
  renderDetail();
  renderModal();
  syncEditSummary();
  if (touchedColumns.has(state.columnFilterMenu.columnIndex)) renderColumnFilterValues();
}

function refreshAfterCellValueChange(rowIndex, columnIndex) {
  patchQueryWorkerCells([{ rowIndex, columnIndex }]);
  recomputeView();
  updateFileStats();
  renderDetail();
  renderModal();
  syncEditSummary();
  if (state.columnFilterMenu.columnIndex === columnIndex) renderColumnFilterValues();
}

function saveCellEdit() {
  if (!isEditingSelectedCell()) return;
  const { rowIndex, columnIndex, value } = state.cellEdit;
  const changed = setCellValue(rowIndex, columnIndex, value);
  state.cellEdit = null;
  if (changed) {
    refreshAfterCellValueChange(rowIndex, columnIndex);
    els.leftStatus.textContent = `已更新 R${rowIndex + 2}C${columnIndex + 1}`;
  } else {
    renderDetail();
    els.leftStatus.textContent = "单元格内容未变化";
  }
}

function focusOperationCell(rowIndex, columnIndex) {
  if (!hasDataRowIndex(rowIndex) || columnIndex < 0 || columnIndex >= state.headers.length) return;
  state.selected = { rowIndex, columnIndex };
  state.detailMode = "cell";
  clearSelectionToSelected();
}

function setManualHighlight(rowIndex, columnIndex, color, options = {}) {
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return false;
  if (!hasDataRowIndex(rowIndex) || columnIndex < 0 || columnIndex >= state.headers.length) return false;
  const nextColor = MANUAL_HIGHLIGHT_COLORS.has(color) ? color : "";
  const key = getCellKey(rowIndex, columnIndex);
  const previousColor = state.manualHighlights.get(key) || "";
  if (previousColor === nextColor) return false;
  if (nextColor) state.manualHighlights.set(key, nextColor);
  else state.manualHighlights.delete(key);
  if (options.recordHistory !== false) {
    pushEditHistory({
      type: "cell-highlight",
      rowIndex,
      columnIndex,
      previousColor,
      nextColor,
    });
  }
  renderGrid();
  renderDetail();
  syncEditSummary();
  return true;
}

function applySelectedHighlight(color) {
  if (!state.selected) return false;
  const { rowIndex, columnIndex } = state.selected;
  const changed = setManualHighlight(rowIndex, columnIndex, color);
  if (changed) {
    const label = color ? "已设置高亮" : "已清除高亮";
    els.leftStatus.textContent = `${label} R${rowIndex + 2}C${columnIndex + 1}`;
  }
  return changed;
}

function undoLastAction() {
  const entry = state.undoStack.pop();
  if (!entry) {
    syncEditSummary();
    return;
  }
  state.cellEdit = null;
  const focusEntry = entry.type === "cell-batch-value" ? entry.changes?.[0] : entry;
  if (focusEntry) focusOperationCell(focusEntry.rowIndex, focusEntry.columnIndex);
  if (entry.type === "cell-value") {
    const changed = setCellValue(entry.rowIndex, entry.columnIndex, entry.previousValue, { recordHistory: false });
    refreshAfterCellValueChange(entry.rowIndex, entry.columnIndex);
    els.leftStatus.textContent = changed
      ? `已撤回编辑 R${entry.rowIndex + 2}C${entry.columnIndex + 1}`
      : "没有可撤回的内容变化";
  } else if (entry.type === "cell-batch-value") {
    const changes = entry.changes || [];
    const changedItems = [];
    for (const change of changes) {
      const changed = setCellValue(change.rowIndex, change.columnIndex, change.previousValue, {
        recordHistory: false,
        invalidateCache: false,
        refreshIssues: false,
      });
      if (changed) changedItems.push(change);
    }
    refreshAfterCellValueBatchChange(changes);
    els.leftStatus.textContent = changedItems.length
      ? `已撤回粘贴 ${changedItems.length.toLocaleString()} 个 cell`
      : "没有可撤回的粘贴变化";
  } else if (entry.type === "cell-highlight") {
    setManualHighlight(entry.rowIndex, entry.columnIndex, entry.previousColor, { recordHistory: false });
    syncEditSummary();
    els.leftStatus.textContent = `已撤回高亮 R${entry.rowIndex + 2}C${entry.columnIndex + 1}`;
  }
  pushRedoHistory(entry);
  syncEditSummary();
}

function redoLastAction() {
  const entry = state.redoStack.pop();
  if (!entry) {
    syncEditSummary();
    return;
  }
  state.cellEdit = null;
  const focusEntry = entry.type === "cell-batch-value" ? entry.changes?.[0] : entry;
  if (focusEntry) focusOperationCell(focusEntry.rowIndex, focusEntry.columnIndex);
  if (entry.type === "cell-value") {
    const changed = setCellValue(entry.rowIndex, entry.columnIndex, entry.nextValue, { recordHistory: false });
    refreshAfterCellValueChange(entry.rowIndex, entry.columnIndex);
    els.leftStatus.textContent = changed
      ? `已恢复编辑 R${entry.rowIndex + 2}C${entry.columnIndex + 1}`
      : "没有可恢复的内容变化";
  } else if (entry.type === "cell-batch-value") {
    const changes = entry.changes || [];
    const changedItems = [];
    for (const change of changes) {
      const changed = setCellValue(change.rowIndex, change.columnIndex, change.nextValue, {
        recordHistory: false,
        invalidateCache: false,
        refreshIssues: false,
      });
      if (changed) changedItems.push(change);
    }
    refreshAfterCellValueBatchChange(changes);
    els.leftStatus.textContent = changedItems.length
      ? `已恢复粘贴 ${changedItems.length.toLocaleString()} 个 cell`
      : "没有可恢复的粘贴变化";
  } else if (entry.type === "cell-highlight") {
    setManualHighlight(entry.rowIndex, entry.columnIndex, entry.nextColor, { recordHistory: false });
    syncEditSummary();
    els.leftStatus.textContent = `已恢复高亮 R${entry.rowIndex + 2}C${entry.columnIndex + 1}`;
  }
  restoreUndoHistory(entry);
  syncEditSummary();
}

function renderSelectionToolbar() {
  const endpoints = getSelectionEndpoints();
  const hasSelection = Boolean(state.selected && endpoints && state.rows.length);
  const isEditing = isEditingSelectedCell();
  const showToolbar = hasSelection && !isEditing;
  els.selectionToolbar.classList.toggle("visible", showToolbar);
  els.selectionToolbar.setAttribute("aria-hidden", String(!showToolbar));
  if (!hasSelection) return;

  const rowCount = endpoints.endRowPosition - endpoints.startRowPosition + 1;
  const columnCount = endpoints.endColumnPosition - endpoints.startColumnPosition + 1;
  const cellCount = rowCount * columnCount;
  const isSingleCell = cellCount === 1;
  els.selectionToolbarStatus.textContent = isSingleCell
    ? `R${state.selected.rowIndex + 2}C${state.selected.columnIndex + 1} · ${state.headers[state.selected.columnIndex] || "单元格"}`
    : `${rowCount.toLocaleString()} 行 × ${columnCount.toLocaleString()} 列 · ${cellCount.toLocaleString()} 个单元格`;
  els.selectionEditButton.disabled = !isSingleCell;
  els.selectionHighlightButton.disabled = !isSingleCell;
  els.selectionOpenButton.disabled = !isSingleCell;
  els.selectionExcludeButton.disabled = rowCount < 1;
}

function renderDetail() {
  syncDetailMode();
  if (state.detailMode === "profile") {
    renderSelectionToolbar();
    syncEditSummary();
    renderColumnProfile();
    return;
  }
  const selected = state.selected;
  const hasSelection = Boolean(selected);
  const rawValue = selected ? getDataCellValue(selected.rowIndex, selected.columnIndex) : "";
  const isLoadingLargeCell = Boolean(selected && isLargeDataMode() && rawValue === undefined);
  const value = rawValue ?? "";
  const isEditing = isEditingSelectedCell();
  renderSelectionToolbar();
  syncEditSummary();
  syncCellEditControls(hasSelection, isEditing);
  els.loadMoreDetailButton.disabled = !hasSelection || isEditing || state.detailVisibleStart + state.detailVisibleChars >= value.length;
  els.loadMoreDetailButton.textContent = "下一页";
  els.detailContent.classList.toggle("mono", els.monoInput.checked);
  els.detailContent.classList.toggle("editing", isEditing);

  if (!selected) {
    state.cellEdit = null;
    els.detailMeta.innerHTML = "";
    applyCellMetaStyle(els.detailContent, null);
    els.detailContent.textContent = "";
    els.detailStatus.textContent = "未选择单元格";
    return;
  }

  if (isLoadingLargeCell) {
    applyCellMetaStyle(els.detailContent, null);
    els.detailContent.textContent = "正在读取完整单元格内容…";
    els.detailStatus.textContent = "读取中";
    els.loadMoreDetailButton.disabled = true;
    prefetchLargeCell(selected.rowIndex, selected.columnIndex, { modal: false });
    return;
  }

  const cellMeta = getCellMeta(selected.rowIndex, selected.columnIndex);
  const cellKey = getCellKey(selected.rowIndex, selected.columnIndex);
  const manualHighlight = getManualHighlight(selected.rowIndex, selected.columnIndex);
  els.detailMeta.innerHTML = "";
  const metaItems = [
    `行 ${selected.rowIndex + 2}`,
    `列 ${selected.columnIndex + 1}`,
    state.headers[selected.columnIndex] || "",
    `${String(value).length.toLocaleString()} 字符`,
    `${getLineCount(value).toLocaleString()} 行文本`,
  ];
  if (state.editedCells.has(cellKey)) metaItems.push("已编辑");
  if (manualHighlight) metaItems.push(`高亮：${manualHighlight}`);
  for (const item of metaItems) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = item;
    els.detailMeta.appendChild(pill);
  }

  if (isEditing) {
    renderCellEditor();
    els.detailStatus.textContent = `${String(state.cellEdit.value).length.toLocaleString()} 字符 · 编辑中`;
    els.leftStatus.textContent = `正在编辑 R${selected.rowIndex + 2}C${selected.columnIndex + 1}`;
    return;
  }

  const occurrences = countOccurrences(value, els.detailSearchInput.value, els.caseSensitiveInput.checked);
  renderTextContent(els.detailContent, value, els.detailSearchInput.value, state.detailVisibleChars, cellMeta, state.detailVisibleStart);
  const detailEnd = Math.min(value.length, state.detailVisibleStart + state.detailVisibleChars);
  els.detailStatus.textContent = `${(value.length ? state.detailVisibleStart + 1 : 0).toLocaleString()}～${detailEnd.toLocaleString()} / ${value.length.toLocaleString()} 字符 · 命中 ${occurrences.toLocaleString()}`;
  els.leftStatus.textContent = `选中 R${selected.rowIndex + 2}C${selected.columnIndex + 1}`;
}

function renderModal() {
  const cell = state.modalCell;
  if (!cell) return;
  const rawValue = getDataCellValue(cell.rowIndex, cell.columnIndex);
  if (isLargeDataMode() && rawValue === undefined) {
    els.modalContent.textContent = "正在读取完整单元格内容…";
    els.modalStatus.textContent = "读取中";
    els.loadMoreModalButton.disabled = true;
    prefetchLargeCell(cell.rowIndex, cell.columnIndex, { detail: false, modal: true });
    return;
  }
  const value = rawValue ?? "";
  const cellMeta = getCellMeta(cell.rowIndex, cell.columnIndex);
  const shown = String(value).slice(state.modalVisibleStart, state.modalVisibleStart + state.modalVisibleChars);
  const format = resolveModalFormat(shown, cellMeta);
  els.modalContent.classList.toggle("mono", els.modalMonoInput.checked);
  els.modalTitle.textContent = `R${cell.rowIndex + 2}C${cell.columnIndex + 1} · ${state.headers[cell.columnIndex] || ""}`;
  renderTextContent(els.modalContent, value, els.modalSearchInput.value, state.modalVisibleChars, cellMeta, state.modalVisibleStart);
  renderModalParsedContent(shown, format, cellMeta);
  const occurrences = countOccurrences(value, els.modalSearchInput.value, els.caseSensitiveInput.checked);
  els.modalDetectedFormat.textContent = els.modalFormatSelect.value === "auto"
    ? `自动：${MODAL_FORMAT_LABELS[format] || "纯文本"}`
    : MODAL_FORMAT_LABELS[format] || "纯文本";
  const modalEnd = Math.min(value.length, state.modalVisibleStart + state.modalVisibleChars);
  els.modalStatus.textContent = `${(value.length ? state.modalVisibleStart + 1 : 0).toLocaleString()}～${modalEnd.toLocaleString()} / ${value.length.toLocaleString()} 字符 · 命中 ${occurrences.toLocaleString()}`;
  els.loadMoreModalButton.disabled = state.modalVisibleStart + state.modalVisibleChars >= value.length;
  els.loadMoreModalButton.textContent = "下一页";
}

function openModalForCell(rowIndex, columnIndex) {
  state.modalCell = { rowIndex, columnIndex };
  state.modalVisibleChars = MODAL_CHUNK;
  state.modalVisibleStart = 0;
  els.modalSearchInput.value = els.detailSearchInput.value;
  els.modalFormatSelect.value = "auto";
  state.modalSuppressBackdropClickUntil = 0;
  els.modalViewer.style.removeProperty("--modal-source-width");
  els.modalBackdrop.querySelector(".modal").style.removeProperty("--modal-width");
  els.modalBackdrop.querySelector(".modal").style.removeProperty("--modal-height");
  renderModal();
  prefetchLargeCell(rowIndex, columnIndex, { detail: false, modal: true });
  openManagedDialog(els.modalBackdrop, els.modalSearchInput);
}

function closeModal() {
  closeManagedDialog(els.modalBackdrop);
  state.modalCell = null;
  state.modalSplitResize = null;
  state.modalResize = null;
  state.modalSuppressBackdropClickUntil = 0;
}

function openContextMenu(event, rowIndex, columnIndex) {
  event.preventDefault();
  selectCell(rowIndex, columnIndex);
  els.contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  els.contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 150)}px`;
  els.contextMenu.classList.add("open");
}

function closeContextMenu() {
  els.contextMenu.classList.remove("open");
}

function handleDocumentPointerDown(event) {
  if (!eventPathContains(event, els.contextMenu)) closeContextMenu();
}

function eventPathContains(event, element) {
  if (!element) return false;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  return path.length ? path.includes(element) : element.contains(event.target);
}

function eventPathHasSelector(event, selector) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.length) {
    return path.some((node) => node instanceof Element && node.matches(selector));
  }
  return event.target instanceof Element ? Boolean(event.target.closest(selector)) : false;
}

function getOpenManagedDialog() {
  return [els.recoveryDraftBackdrop, els.shortcutHelpBackdrop, els.commandPaletteBackdrop, els.modalBackdrop]
    .find((backdrop) => backdrop.classList.contains("open")) || null;
}

function openManagedDialog(backdrop, initialFocus) {
  if (!backdrop.classList.contains("open")) dialogReturnFocus.set(backdrop, document.activeElement);
  backdrop.classList.add("open");
  els.appRoot.inert = true;
  requestAnimationFrame(() => initialFocus?.focus());
}

function closeManagedDialog(backdrop) {
  if (!backdrop.classList.contains("open")) return;
  backdrop.classList.remove("open");
  const remainingDialog = getOpenManagedDialog();
  els.appRoot.inert = Boolean(remainingDialog);
  const returnFocus = dialogReturnFocus.get(backdrop);
  dialogReturnFocus.delete(backdrop);
  if (
    returnFocus instanceof HTMLElement &&
    returnFocus.isConnected &&
    (!els.appRoot.inert || remainingDialog?.contains(returnFocus))
  ) {
    returnFocus.focus();
  }
}
