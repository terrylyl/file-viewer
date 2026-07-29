function appendHighlightedText(parent, text, query) {
  const value = text == null ? "" : String(text);
  if (!query) {
    parent.appendChild(document.createTextNode(value));
    return;
  }
  const caseSensitive = els.caseSensitiveInput.checked;
  const haystack = normalizeForSearch(value, caseSensitive);
  const needle = normalizeForSearch(query, caseSensitive);
  if (!needle) {
    parent.appendChild(document.createTextNode(value));
    return;
  }
  let offset = 0;
  let found = haystack.indexOf(needle, offset);
  while (found >= 0) {
    if (found > offset) parent.appendChild(document.createTextNode(value.slice(offset, found)));
    const mark = document.createElement("mark");
    mark.textContent = value.slice(found, found + needle.length);
    parent.appendChild(mark);
    offset = found + needle.length;
    found = haystack.indexOf(needle, offset);
  }
  if (offset < value.length) parent.appendChild(document.createTextNode(value.slice(offset)));
}

function appendHighlighted(parent, text, query) {
  parent.textContent = "";
  appendHighlightedText(parent, text, query);
}

function normalizeLinkHref(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let href = text;
  if (/^www\./i.test(href)) href = `https://${href}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href)) href = `mailto:${href}`;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function detectCellLinks(text) {
  const value = text == null ? "" : String(text);
  const linkPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  const segments = [];
  let offset = 0;
  let match;
  while ((match = linkPattern.exec(value)) !== null) {
    const raw = match[0];
    const trailing = raw.match(/[.,;:!?)]*$/)?.[0] || "";
    const linkText = trailing ? raw.slice(0, -trailing.length) : raw;
    const href = normalizeLinkHref(linkText);
    if (!href) continue;
    if (match.index > offset) segments.push({ text: value.slice(offset, match.index) });
    segments.push({ text: linkText, href });
    if (trailing) segments.push({ text: trailing });
    offset = match.index + raw.length;
  }
  if (offset < value.length) segments.push({ text: value.slice(offset) });
  return segments.some((segment) => segment.href) ? segments : [];
}

function appendLinkedText(parent, text, query, forcedHref = "") {
  const value = text == null ? "" : String(text);
  const href = normalizeLinkHref(forcedHref);
  const segments = href ? [{ text: value, href }] : detectCellLinks(value);
  if (!segments.length) {
    appendHighlighted(parent, value, query);
    return;
  }
  parent.textContent = "";
  for (const segment of segments) {
    if (!segment.href) {
      appendHighlightedText(parent, segment.text, query);
      continue;
    }
    const anchor = document.createElement("a");
    anchor.href = segment.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.title = segment.href;
    appendHighlightedText(anchor, segment.text, query);
    parent.appendChild(anchor);
  }
}

function isDuplicateColumn(columnIndex) {
  return (state.issues.duplicateColumns || []).some((issue) => {
    if (Array.isArray(issue.columnIndexes)) return issue.columnIndexes.includes(columnIndex);
    return issue.columnIndex === columnIndex;
  });
}

function isCustomColumn(columnIndex) {
  return state.customColumns.has(columnIndex);
}

function getCellMeta(rowIndex, columnIndex) {
  if (!state.cellMeta || !state.cellMeta.size) return null;
  return state.cellMeta.get(`${rowIndex}:${columnIndex}`) || null;
}

function getCellKey(rowIndex, columnIndex) {
  return `${rowIndex}:${columnIndex}`;
}

function getCellVersion(rowIndex, columnIndex) {
  return state.cellVersions.get(getCellKey(rowIndex, columnIndex)) || 0;
}

function touchCellVersion(rowIndex, columnIndex) {
  const key = getCellKey(rowIndex, columnIndex);
  state.cellVersions.set(key, (state.cellVersions.get(key) || 0) + 1);
}

function invalidateCellRenderCache(rowIndex = null, columnIndex = null) {
  if (rowIndex == null || columnIndex == null) {
    state.cellRenderCache.clear();
    return;
  }
  const prefix = `${getCellKey(rowIndex, columnIndex)}|`;
  for (const key of state.cellRenderCache.keys()) {
    if (key.startsWith(prefix)) state.cellRenderCache.delete(key);
  }
}

function getCellMetaCacheKey(meta) {
  if (!meta) return "none";
  return [
    meta.backgroundColor || "",
    meta.color || "",
    meta.link || "",
    meta.html ? `${meta.html.length}:${meta.html.slice(0, 48)}` : "",
  ].join("|");
}

function getCellRenderCacheKey(rowIndex, columnIndex, value, query, meta, options = {}) {
  return [
    getCellKey(rowIndex, columnIndex),
    getCellVersion(rowIndex, columnIndex),
    options.wrap ? "wrap" : "clip",
    options.allowHtml ? "html" : "text",
    els.caseSensitiveInput.checked ? "case" : "nocase",
    String(query || ""),
    getCellMetaCacheKey(meta),
    String(value == null ? "" : value).length,
  ].join("|");
}

function appendCachedCellRender(container, cacheKey, meta) {
  const cached = state.cellRenderCache.get(cacheKey);
  if (!cached) return false;
  state.cellRenderCache.delete(cacheKey);
  state.cellRenderCache.set(cacheKey, cached);
  container.innerHTML = "";
  applyCellMetaStyle(container, meta);
  for (const node of cached.nodes) container.appendChild(node.cloneNode(true));
  return true;
}

function rememberCellRender(cacheKey, container) {
  if (!cacheKey) return;
  const nodes = [...container.childNodes].map((node) => node.cloneNode(true));
  state.cellRenderCache.set(cacheKey, { nodes });
  while (state.cellRenderCache.size > MAX_CELL_RENDER_CACHE) {
    const oldestKey = state.cellRenderCache.keys().next().value;
    state.cellRenderCache.delete(oldestKey);
  }
}

function getEditedCellOriginalValue(rowIndex, columnIndex) {
  return state.editedCells.get(getCellKey(rowIndex, columnIndex));
}

function syncEditedCellTracking(rowIndex, columnIndex, originalValue, nextValue) {
  const key = getCellKey(rowIndex, columnIndex);
  if (String(nextValue ?? "") === String(originalValue ?? "")) {
    state.editedCells.delete(key);
  } else {
    state.editedCells.set(key, String(originalValue ?? ""));
  }
}

function getManualHighlight(rowIndex, columnIndex) {
  return state.manualHighlights.get(getCellKey(rowIndex, columnIndex)) || "";
}

function getManualHighlightClass(rowIndex, columnIndex) {
  const color = getManualHighlight(rowIndex, columnIndex);
  return color ? `manual-highlight-${color}` : "";
}

function syncEditSummary() {
  els.editedCellCount.textContent = `已编辑 ${state.editedCells.size.toLocaleString()} 个 cell`;
  els.editedCellCount.classList.toggle("warning", state.editedCells.size > 0);
  els.undoLastActionButton.disabled = state.undoStack.length === 0;
  els.redoLastActionButton.disabled = state.redoStack.length === 0;
}

function pushEditHistory(entry) {
  state.undoStack.push(entry);
  if (state.undoStack.length > MAX_EDIT_HISTORY) state.undoStack.shift();
  state.redoStack = [];
  syncEditSummary();
}

function pushRedoHistory(entry) {
  state.redoStack.push(entry);
  if (state.redoStack.length > MAX_EDIT_HISTORY) state.redoStack.shift();
  syncEditSummary();
}

function restoreUndoHistory(entry) {
  state.undoStack.push(entry);
  if (state.undoStack.length > MAX_EDIT_HISTORY) state.undoStack.shift();
  syncEditSummary();
}

function reindexCellKeyMap(map, removedColumnIndex) {
  const next = new Map();
  for (const [key, value] of map.entries()) {
    const [rowPart, columnPart] = key.split(":");
    const columnIndex = Number(columnPart);
    if (columnIndex === removedColumnIndex) continue;
    const nextColumnIndex = columnIndex > removedColumnIndex ? columnIndex - 1 : columnIndex;
    next.set(`${rowPart}:${nextColumnIndex}`, value);
  }
  return next;
}

function reindexEditHistory(history, removedColumnIndex) {
  return history
    .map((entry) => {
      if (entry.type === "cell-batch-value") {
        const changes = (entry.changes || [])
          .filter((change) => change.columnIndex !== removedColumnIndex)
          .map((change) =>
            change.columnIndex > removedColumnIndex
              ? { ...change, columnIndex: change.columnIndex - 1 }
              : change,
          );
        return changes.length ? { ...entry, changes } : null;
      }
      if (entry.columnIndex === removedColumnIndex) return null;
      return entry.columnIndex > removedColumnIndex
        ? { ...entry, columnIndex: entry.columnIndex - 1 }
        : entry;
    })
    .filter(Boolean);
}

function applyCellMetaStyle(element, meta) {
  element.style.removeProperty("background-color");
  element.style.removeProperty("color");
  if (!meta) return;
  if (meta.backgroundColor) element.style.backgroundColor = meta.backgroundColor;
  if (meta.color) element.style.color = meta.color;
}

function sanitizeStyleAttribute(value) {
  const allowed = new Set(["color", "background-color", "font-weight", "font-style", "text-decoration"]);
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const splitAt = part.indexOf(":");
      if (splitAt < 0) return "";
      const name = part.slice(0, splitAt).trim().toLowerCase();
      const rawValue = part.slice(splitAt + 1).trim();
      if (!allowed.has(name)) return "";
      if (/url\s*\(|@import|expression\s*\(|javascript:/i.test(rawValue)) return "";
      return `${name}: ${rawValue}`;
    })
    .filter(Boolean)
    .join("; ");
}

function appendSanitizedExcelHtml(parent, html) {
  const allowedTags = new Set(["span", "b", "strong", "i", "em", "u", "s", "sub", "sup", "br"]);
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();

    const sourceTag = node.tagName.toLowerCase();
    if (sourceTag === "br") return document.createElement("br");
    const targetTag = sourceTag === "font" ? "span" : sourceTag;
    const fragment = document.createDocumentFragment();
    if (!allowedTags.has(targetTag)) {
      for (const child of node.childNodes) fragment.appendChild(cleanNode(child));
      return fragment;
    }

    const element = document.createElement(targetTag);
    const style = sanitizeStyleAttribute(node.getAttribute("style"));
    if (style) element.setAttribute("style", style);
    if (sourceTag === "font") {
      const color = node.getAttribute("color");
      if (color && !/url\s*\(|expression\s*\(|javascript:/i.test(color)) element.style.color = color;
    }
    for (const child of node.childNodes) element.appendChild(cleanNode(child));
    return element;
  };

  for (const child of template.content.childNodes) parent.appendChild(cleanNode(child));
}

function renderCellDisplayContent(container, value, query, meta, options = {}) {
  if (options.cacheKey && appendCachedCellRender(container, options.cacheKey, meta)) return;
  container.innerHTML = "";
  const text = value == null ? "" : String(value);
  applyCellMetaStyle(container, meta);
  const hasInlineLink = Boolean(meta?.link) || detectCellLinks(text).length > 0;
  if (meta?.html && options.allowHtml && !query && !hasInlineLink) {
    appendSanitizedExcelHtml(container, meta.html);
    rememberCellRender(options.cacheKey, container);
    return;
  }
  appendLinkedText(container, text, query, meta?.link || "");
  rememberCellRender(options.cacheKey, container);
}

function getVisibleRowPosition(rowIndex) {
  return state.rowPositionMap.get(rowIndex) ?? -1;
}

function getVisibleColumnPosition(columnIndex) {
  return getVisibleColumnIndexes().indexOf(columnIndex);
}

function getFirstVisibleCell() {
  const columns = getVisibleColumnIndexes();
  if (!state.viewIndices.length || !columns.length) return null;
  return { rowIndex: state.viewIndices[0], columnIndex: columns[0] };
}

function getSelectionEndpoints(range = state.selectionRange) {
  if (!range) return null;
  const columns = getVisibleColumnIndexes();
  if (!state.viewIndices.length || !columns.length) return null;
  if (range.type === "all") {
    return {
      startRowPosition: 0,
      endRowPosition: state.viewIndices.length - 1,
      startColumnPosition: 0,
      endColumnPosition: columns.length - 1,
    };
  }
  const anchorRowPosition = range.anchorRowIndex == null ? 0 : getVisibleRowPosition(range.anchorRowIndex);
  const focusRowPosition = range.focusRowIndex == null ? state.viewIndices.length - 1 : getVisibleRowPosition(range.focusRowIndex);
  const anchorColumnPosition = range.anchorColumnIndex == null ? 0 : getVisibleColumnPosition(range.anchorColumnIndex);
  const focusColumnPosition = range.focusColumnIndex == null ? columns.length - 1 : getVisibleColumnPosition(range.focusColumnIndex);
  const rowA = range.type === "columns" ? 0 : anchorRowPosition;
  const rowB = range.type === "columns" ? state.viewIndices.length - 1 : focusRowPosition;
  const colA = range.type === "rows" ? 0 : anchorColumnPosition;
  const colB = range.type === "rows" ? columns.length - 1 : focusColumnPosition;
  if (rowA < 0 || rowB < 0 || colA < 0 || colB < 0) return null;
  return {
    startRowPosition: Math.min(rowA, rowB),
    endRowPosition: Math.max(rowA, rowB),
    startColumnPosition: Math.min(colA, colB),
    endColumnPosition: Math.max(colA, colB),
  };
}

function isCellInSelection(rowIndex, columnIndex) {
  const endpoints = getSelectionEndpoints();
  if (!endpoints) return false;
  const rowPosition = getVisibleRowPosition(rowIndex);
  const columnPosition = getVisibleColumnPosition(columnIndex);
  return (
    rowPosition >= endpoints.startRowPosition &&
    rowPosition <= endpoints.endRowPosition &&
    columnPosition >= endpoints.startColumnPosition &&
    columnPosition <= endpoints.endColumnPosition
  );
}

function isRowInSelection(rowIndex) {
  const endpoints = getSelectionEndpoints();
  if (!endpoints) return false;
  const rowPosition = getVisibleRowPosition(rowIndex);
  return rowPosition >= endpoints.startRowPosition && rowPosition <= endpoints.endRowPosition;
}

function isColumnInSelection(columnIndex) {
  const endpoints = getSelectionEndpoints();
  if (!endpoints) return false;
  const columnPosition = getVisibleColumnPosition(columnIndex);
  return columnPosition >= endpoints.startColumnPosition && columnPosition <= endpoints.endColumnPosition;
}

function setFocusedCell(rowIndex, columnIndex) {
  if (
    state.cellEdit &&
    (state.cellEdit.rowIndex !== rowIndex || state.cellEdit.columnIndex !== columnIndex)
  ) {
    if (hasPendingCellEditChange()) {
      els.leftStatus.textContent = "当前单元格正在编辑，请先保存或取消";
      return false;
    }
    state.cellEdit = null;
  }
  state.selected = { rowIndex, columnIndex };
  if (state.detailMode === "profile") state.profileColumnIndex = columnIndex;
  state.detailVisibleChars = DETAIL_CHUNK;
  return true;
}

function setSelection(range, focusCell = null) {
  if (focusCell && !setFocusedCell(focusCell.rowIndex, focusCell.columnIndex)) return false;
  else if (!state.selected) {
    const first = getFirstVisibleCell();
    if (first && !setFocusedCell(first.rowIndex, first.columnIndex)) return false;
  }
  state.selectionRange = range;
  return true;
}

function selectCellRange(anchorRowIndex, anchorColumnIndex, focusRowIndex, focusColumnIndex, options = {}) {
  const focusCell = { rowIndex: focusRowIndex, columnIndex: focusColumnIndex };
  if (!setSelection(
    { type: "range", anchorRowIndex, anchorColumnIndex, focusRowIndex, focusColumnIndex },
    focusCell,
  )) return false;
  if (!options.preserveAnchor) state.selectionAnchor = { rowIndex: anchorRowIndex, columnIndex: anchorColumnIndex };
  if (!options.silent) {
    ensureCellVisible(focusRowIndex, focusColumnIndex);
    renderGrid();
    renderDetail();
  }
  return true;
}

function selectRowRange(anchorRowIndex, focusRowIndex, options = {}) {
  const columnIndex = state.selected?.columnIndex ?? getVisibleColumnIndexes()[0] ?? 0;
  if (!setSelection(
    { type: "rows", anchorRowIndex, anchorColumnIndex: columnIndex, focusRowIndex, focusColumnIndex: columnIndex },
    { rowIndex: focusRowIndex, columnIndex },
  )) return false;
  if (!options.preserveAnchor) state.selectionAnchor = { rowIndex: anchorRowIndex, columnIndex };
  if (!options.silent) {
    ensureCellVisible(focusRowIndex, columnIndex);
    renderGrid();
    renderDetail();
  }
  return true;
}

function selectColumnRange(anchorColumnIndex, focusColumnIndex, options = {}) {
  const rowIndex = state.selected?.rowIndex ?? state.viewIndices[0] ?? 0;
  if (!setSelection(
    { type: "columns", anchorRowIndex: rowIndex, anchorColumnIndex, focusRowIndex: rowIndex, focusColumnIndex },
    { rowIndex, columnIndex: focusColumnIndex },
  )) return false;
  if (!options.preserveAnchor) state.selectionAnchor = { rowIndex, columnIndex: anchorColumnIndex };
  if (!options.silent) {
    ensureCellVisible(rowIndex, focusColumnIndex);
    renderGrid();
    renderDetail();
  }
  return true;
}

function selectAllVisibleCells() {
  const first = getFirstVisibleCell();
  if (!first) return;
  const columns = getVisibleColumnIndexes();
  const last = { rowIndex: state.viewIndices[state.viewIndices.length - 1], columnIndex: columns[columns.length - 1] };
  if (!setSelection(
    { type: "all", anchorRowIndex: first.rowIndex, anchorColumnIndex: first.columnIndex, focusRowIndex: last.rowIndex, focusColumnIndex: last.columnIndex },
    first,
  )) return false;
  state.selectionAnchor = first;
  renderGrid();
  renderDetail();
  return true;
}

function clearSelectionToSelected() {
  if (!state.selected) {
    state.selectionAnchor = null;
    state.selectionRange = null;
    return;
  }
  state.selectionAnchor = { ...state.selected };
  state.selectionRange = {
    type: "range",
    anchorRowIndex: state.selected.rowIndex,
    anchorColumnIndex: state.selected.columnIndex,
    focusRowIndex: state.selected.rowIndex,
    focusColumnIndex: state.selected.columnIndex,
  };
}

function normalizeSelectionForCurrentView() {
  const columns = getVisibleColumnIndexes();
  const first = getFirstVisibleCell();
  if (!first) {
    state.selected = null;
    clearSelectionToSelected();
    return;
  }
  if (
    !state.selected ||
    !state.rowPositionMap.has(state.selected.rowIndex) ||
    !columns.includes(state.selected.columnIndex)
  ) {
    state.selected = first;
    clearSelectionToSelected();
    return;
  }
  if (!getSelectionEndpoints()) clearSelectionToSelected();
}

function ensureCellVisible(rowIndex, columnIndex) {
  const rowPosition = getVisibleRowPosition(rowIndex);
  const visibleColumns = getVisibleColumnIndexes();
  const columnPosition = visibleColumns.indexOf(columnIndex);
  if (rowPosition < 0 || columnPosition < 0) return;
  const rowHeight = getCurrentRowHeight();
  const rowTop = getCurrentHeaderHeight() + rowPosition * rowHeight;
  const rowBottom = rowTop + rowHeight;
  const viewportTop = els.gridViewport.scrollTop;
  const viewportBottom = viewportTop + els.gridViewport.clientHeight;
  if (rowTop < viewportTop) els.gridViewport.scrollTop = rowTop;
  else if (rowBottom > viewportBottom) els.gridViewport.scrollTop = rowBottom - els.gridViewport.clientHeight;

  let columnLeft = ROW_NUMBER_WIDTH;
  for (let index = 0; index < columnPosition; index += 1) {
    columnLeft += state.columnWidths[visibleColumns[index]] || DEFAULT_COL_WIDTH;
  }
  const columnRight = columnLeft + (state.columnWidths[columnIndex] || DEFAULT_COL_WIDTH);
  const viewportLeft = els.gridViewport.scrollLeft;
  const viewportRight = viewportLeft + els.gridViewport.clientWidth;
  if (columnLeft < viewportLeft + ROW_NUMBER_WIDTH) els.gridViewport.scrollLeft = Math.max(0, columnLeft - ROW_NUMBER_WIDTH);
  else if (columnRight > viewportRight) els.gridViewport.scrollLeft = columnRight - els.gridViewport.clientWidth;
}

function moveSelectionByKeyboard(event) {
  const deltas = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const delta = deltas[event.key];
  if (!delta) return false;
  const columns = getVisibleColumnIndexes();
  if (!state.viewIndices.length || !columns.length) return true;
  const current = state.selected || getFirstVisibleCell();
  let rowPosition = getVisibleRowPosition(current.rowIndex);
  let columnPosition = columns.indexOf(current.columnIndex);
  if (rowPosition < 0) rowPosition = 0;
  if (columnPosition < 0) columnPosition = 0;
  rowPosition = Math.max(0, Math.min(state.viewIndices.length - 1, rowPosition + delta[0]));
  columnPosition = Math.max(0, Math.min(columns.length - 1, columnPosition + delta[1]));
  const next = { rowIndex: state.viewIndices[rowPosition], columnIndex: columns[columnPosition] };
  if (event.shiftKey) {
    const anchor = state.selectionAnchor || current || next;
    selectCellRange(anchor.rowIndex, anchor.columnIndex, next.rowIndex, next.columnIndex, { preserveAnchor: true });
  } else {
    selectCell(next.rowIndex, next.columnIndex);
  }
  return true;
}

function handleGridKeyDown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllVisibleCells();
    return;
  }
  if (moveSelectionByKeyboard(event)) event.preventDefault();
}

function isEditableShortcutTarget(target) {
  if (!(target instanceof Element)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function handleCopyShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return;
  if (isEditableShortcutTarget(event.target)) return;
  if (!state.selected) return;
  event.preventDefault();
  copySelection();
}

function handleUndoShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
  if (isEditableShortcutTarget(event.target)) return;
  if (event.shiftKey) {
    if (!state.redoStack.length) return;
    event.preventDefault();
    redoLastAction();
    return;
  }
  if (!state.undoStack.length) return;
  event.preventDefault();
  undoLastAction();
}

function handlePasteIntoCustomColumns(event) {
  if (isEditableShortcutTarget(event.target)) return;
  const text = event.clipboardData?.getData("text/plain") || "";
  if (!text) return;
  if (pasteClipboardTextIntoSelection(text)) event.preventDefault();
}

function startSelectionDrag(type, anchorRowIndex, anchorColumnIndex, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  if (
    state.cellEdit &&
    (state.cellEdit.rowIndex !== anchorRowIndex || state.cellEdit.columnIndex !== anchorColumnIndex) &&
    hasPendingCellEditChange()
  ) {
    els.leftStatus.textContent = "当前单元格正在编辑，请先保存或取消";
    return;
  }
  els.gridViewport.focus();
  state.selectionDrag = { type, anchorRowIndex, anchorColumnIndex };
  updateSelectionDrag(type, anchorRowIndex, anchorColumnIndex);
}

function updateSelectionDrag(type, rowIndex, columnIndex) {
  if (!state.selectionDrag) return;
  const drag = state.selectionDrag;
  if (type === "row" || drag.type === "row") {
    selectRowRange(drag.anchorRowIndex, rowIndex, { preserveAnchor: true });
  } else if (type === "column" || drag.type === "column") {
    selectColumnRange(drag.anchorColumnIndex, columnIndex, { preserveAnchor: true });
  } else {
    selectCellRange(drag.anchorRowIndex, drag.anchorColumnIndex, rowIndex, columnIndex, { preserveAnchor: true });
  }
}

function stopSelectionDrag() {
  state.selectionDrag = null;
}

function renderHeader() {
  const visibleColumns = getVisibleColumnIndexes();
  els.headerRow.innerHTML = "";
  els.headerRow.style.width = `${getTotalWidth()}px`;
  els.headerRow.style.height = `${getCurrentHeaderHeight()}px`;

  const rowNumber = document.createElement("div");
  rowNumber.className = `row-number select-all-corner${state.selectionRange?.type === "all" ? " selected-row" : ""}`;
  rowNumber.textContent = "#";
  rowNumber.title = "选择全部可见单元格";
  rowNumber.setAttribute("role", "columnheader");
  rowNumber.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    els.gridViewport.focus();
    selectAllVisibleCells();
  });
  els.headerRow.appendChild(rowNumber);

  for (const col of visibleColumns) {
    const cell = document.createElement("div");
    cell.className = "header-cell";
    cell.setAttribute("role", "columnheader");
    if (isColumnInSelection(col)) cell.classList.add("selected-column");
    const duplicate = isDuplicateColumn(col);
    if (duplicate) cell.classList.add("duplicate-column");
    cell.style.flex = `0 0 ${state.columnWidths[col] || DEFAULT_COL_WIDTH}px`;
    cell.draggable = false;
    cell.dataset.column = String(col);
    cell.addEventListener("mousedown", (event) =>
      startSelectionDrag("column", state.selected?.rowIndex ?? state.viewIndices[0] ?? 0, col, event),
    );
    cell.addEventListener("mouseenter", () =>
      updateSelectionDrag("column", state.selected?.rowIndex ?? state.viewIndices[0] ?? 0, col),
    );

    const button = document.createElement("button");
    button.className = "header-sort-button";
    button.title = state.headers[col];
    button.setAttribute("aria-label", `${state.headers[col]}，选择整列`);
    button.dataset.column = String(col);
    button.draggable = true;
    const title = document.createElement("span");
    title.className = "header-title";
    title.textContent = state.headers[col];
    if (duplicate) {
      const dot = document.createElement("span");
      dot.className = "duplicate-column-dot";
      dot.title = "Duplicate column name";
      button.appendChild(dot);
    }
    const sort = document.createElement("span");
    sort.className = "sort-indicator";
    sort.textContent =
      state.sort.column === col ? (state.sort.direction === "asc" ? "▲" : state.sort.direction === "desc" ? "▼" : "") : "";
    button.append(title, sort);
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", () => selectColumnRange(col, col));
    button.addEventListener("dragstart", (event) => {
      state.dragColumn = col;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(col));
    });
    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const fromColumn =
        state.dragColumn == null ? Number(event.dataTransfer.getData("text/plain")) : state.dragColumn;
      state.dragColumn = null;
      dragColumn(fromColumn, col);
    });
    button.addEventListener("dragend", () => {
      state.dragColumn = null;
    });

    const filterButton = document.createElement("button");
    filterButton.className = `header-filter-button${hasColumnFilter(col) ? " active" : ""}`;
    filterButton.title = "筛选 / 排序";
    filterButton.setAttribute("aria-label", `${state.headers[col]}：筛选与排序`);
    filterButton.setAttribute("aria-haspopup", "dialog");
    filterButton.setAttribute("aria-expanded", "false");
    filterButton.dataset.column = String(col);
    const filterIcon = document.createElement("span");
    filterIcon.className = "filter-indicator";
    filterIcon.textContent = hasColumnFilter(col) ? "●" : "▾";
    filterButton.appendChild(filterIcon);
    filterButton.addEventListener("mousedown", (event) => event.stopPropagation());
    filterButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openColumnFilterMenu(event.currentTarget, col);
    });

    const handle = document.createElement("span");
    handle.className = "resize-handle";
    handle.dataset.column = String(col);
    handle.addEventListener("pointerdown", startResize);
    cell.append(button, filterButton, handle);
    els.headerRow.appendChild(cell);
  }
}

function renderGrid() {
  state.headerDirty = true;
  queueGridRender();
}

function renderRowsOnly() {
  queueGridRender();
}

function queueGridRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    if (state.headerDirty) {
      renderHeader();
      state.headerDirty = false;
    }
    renderRows();
    const keepEmptyStateForReveal = els.appRoot.classList.contains("workspace-revealing");
    els.emptyState.style.display = state.rows.length && !keepEmptyStateForReveal ? "none" : "grid";
    if (state.rows.length && keepEmptyStateForReveal) activateWorkspaceReveal();
  });
}

function renderRows() {
  const scrollTop = els.gridViewport.scrollTop;
  const viewportHeight = els.gridViewport.clientHeight || 1;
  const rowHeight = getCurrentRowHeight();
  const totalRows = state.viewIndices.length;
  const headerHeight = getCurrentHeaderHeight();
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop - headerHeight) / rowHeight) - 8);
  const end = Math.min(totalRows, Math.ceil((Math.max(0, scrollTop - headerHeight) + viewportHeight) / rowHeight) + 10);
  const visibleColumns = getVisibleColumnIndexes();
  const totalWidth = getTotalWidth();
  els.gridViewport.setAttribute("aria-rowcount", String(totalRows + 1));
  els.gridViewport.setAttribute("aria-colcount", String(visibleColumns.length + 1));
  els.gridViewport.classList.toggle("wrap-cells", state.wrapCells);
  els.gridCanvas.style.height = `${headerHeight + totalRows * rowHeight}px`;
  els.gridCanvas.style.width = `${totalWidth}px`;
  els.rowLayer.innerHTML = "";

  for (let virtualIndex = start; virtualIndex < end; virtualIndex += 1) {
    const rowIndex = state.viewIndices[virtualIndex];
    const row = state.rows[rowIndex];
    const hit = state.matchedRows.has(rowIndex);
    const rowEl = document.createElement("div");
    rowEl.className = `data-row${hit ? " hit" : ""}`;
    rowEl.setAttribute("role", "row");
    rowEl.setAttribute("aria-rowindex", String(virtualIndex + 2));
    rowEl.style.top = `${headerHeight + virtualIndex * rowHeight}px`;
    rowEl.style.width = `${totalWidth}px`;
    rowEl.style.height = `${rowHeight}px`;

    const rowNumber = document.createElement("div");
    rowNumber.className = "row-number";
    rowNumber.setAttribute("role", "rowheader");
    if (isRowInSelection(rowIndex)) rowNumber.classList.add("selected-row");
    rowNumber.textContent = String(rowIndex + 2);
    rowNumber.addEventListener("mousedown", (event) =>
      startSelectionDrag("row", rowIndex, state.selected?.columnIndex ?? visibleColumns[0] ?? 0, event),
    );
    rowNumber.addEventListener("mouseenter", () =>
      updateSelectionDrag("row", rowIndex, state.selected?.columnIndex ?? visibleColumns[0] ?? 0),
    );
    rowEl.appendChild(rowNumber);

    for (const [visibleColumnIndex, col] of visibleColumns.entries()) {
      const value = row[col] || "";
      const summary = summarize(value);
      const meta = getCellMeta(rowIndex, col);
      const cell = document.createElement("div");
      cell.className = `cell${summary.isLong && !state.wrapCells ? " long" : ""}`;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(visibleColumnIndex + 2));
      if (state.editedCells.has(getCellKey(rowIndex, col))) cell.classList.add("edited-cell");
      const manualHighlightClass = getManualHighlightClass(rowIndex, col);
      if (manualHighlightClass) cell.classList.add(manualHighlightClass);
      if (isCellInSelection(rowIndex, col)) {
        cell.classList.add("range-selected");
      }
      if (state.selected && state.selected.rowIndex === rowIndex && state.selected.columnIndex === col) {
        cell.classList.add("selected");
      }
      cell.style.flex = `0 0 ${state.columnWidths[col] || DEFAULT_COL_WIDTH}px`;
      cell.title = state.wrapCells ? value.slice(0, 1000) : summary.isLong ? "文本过长，点击查看全文" : value.slice(0, 1000);
      cell.dataset.row = String(rowIndex);
      cell.dataset.column = String(col);
      const displayValue = state.wrapCells ? value : summary.text;
      const renderOptions = {
        allowHtml: !summary.isLong || state.wrapCells,
        wrap: state.wrapCells,
      };
      renderOptions.cacheKey = getCellRenderCacheKey(
        rowIndex,
        col,
        displayValue,
        els.searchInput.value,
        meta,
        renderOptions,
      );
      renderCellDisplayContent(cell, displayValue, els.searchInput.value, meta, renderOptions);
      if (manualHighlightClass) cell.style.removeProperty("background-color");
      cell.addEventListener("mousedown", (event) => {
        if (event.target.closest?.("a")) return;
        startSelectionDrag("cell", rowIndex, col, event);
      });
      cell.addEventListener("mouseenter", () => updateSelectionDrag("cell", rowIndex, col));
      cell.addEventListener("click", () => selectCell(rowIndex, col));
      cell.addEventListener("dblclick", () => openModalForCell(rowIndex, col));
      cell.addEventListener("contextmenu", (event) => openContextMenu(event, rowIndex, col));
      rowEl.appendChild(cell);
    }

    els.rowLayer.appendChild(rowEl);
  }
}

function dragColumn(fromColumn, toColumn) {
  if (!Number.isInteger(fromColumn) || !Number.isInteger(toColumn) || fromColumn === toColumn) return;
  const order = state.columnOrder.length ? [...state.columnOrder] : state.headers.map((_, index) => index);
  const fromIndex = order.indexOf(fromColumn);
  const toIndex = order.indexOf(toColumn);
  if (fromIndex < 0 || toIndex < 0) return;
  order.splice(fromIndex, 1);
  order.splice(toIndex, 0, fromColumn);
  state.columnOrder = order;
  renderColumnPopover();
  renderColumnOverview();
  renderGrid();
}

function startResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const column = Number(event.currentTarget.dataset.column);
  event.currentTarget.setPointerCapture(event.pointerId);
  state.resize = {
    column,
    startX: event.clientX,
    startWidth: state.columnWidths[column] || DEFAULT_COL_WIDTH,
    pointerId: event.pointerId,
    handle: event.currentTarget,
  };
  document.body.style.cursor = "col-resize";
}

function getModalSplitBounds() {
  const width = els.modalViewer.getBoundingClientRect().width;
  return {
    min: MIN_MODAL_PANE_WIDTH,
    max: Math.max(MIN_MODAL_PANE_WIDTH, width - MIN_MODAL_PANE_WIDTH - 7),
  };
}

function setModalSourcePaneWidth(width) {
  const bounds = getModalSplitBounds();
  const nextWidth = Math.max(bounds.min, Math.min(bounds.max, width));
  els.modalViewer.style.setProperty("--modal-source-width", `${nextWidth}px`);
}

function startModalSplitResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (window.matchMedia("(max-width: 980px)").matches) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  state.modalSplitResize = {
    startX: event.clientX,
    startWidth: els.modalContent.getBoundingClientRect().width,
    pointerId: event.pointerId,
    handle: event.currentTarget,
  };
  document.body.style.cursor = "col-resize";
}

function nudgeModalSplit(delta) {
  if (!state.modalCell || window.matchMedia("(max-width: 980px)").matches) return;
  const currentWidth = els.modalContent.getBoundingClientRect().width;
  setModalSourcePaneWidth(currentWidth + delta);
}

function getModalResizeBounds() {
  const maxWidth = Math.max(320, window.innerWidth - MODAL_VIEWPORT_MARGIN);
  const maxHeight = Math.max(320, window.innerHeight - MODAL_VIEWPORT_MARGIN);
  return {
    minWidth: Math.min(MIN_MODAL_WIDTH, maxWidth),
    minHeight: Math.min(MIN_MODAL_HEIGHT, maxHeight),
    maxWidth,
    maxHeight,
  };
}

function setModalSize(width, height) {
  const bounds = getModalResizeBounds();
  const nextWidth = Math.max(bounds.minWidth, Math.min(bounds.maxWidth, width));
  const nextHeight = Math.max(bounds.minHeight, Math.min(bounds.maxHeight, height));
  els.modalBackdrop.querySelector(".modal").style.setProperty("--modal-width", `${nextWidth}px`);
  els.modalBackdrop.querySelector(".modal").style.setProperty("--modal-height", `${nextHeight}px`);
}

function startModalResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = els.modalBackdrop.querySelector(".modal").getBoundingClientRect();
  event.currentTarget.setPointerCapture(event.pointerId);
  state.modalResize = {
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    pointerId: event.pointerId,
    handle: event.currentTarget,
  };
  document.body.style.cursor = "nwse-resize";
}

function nudgeModalSize(widthDelta, heightDelta) {
  if (!state.modalCell) return;
  const rect = els.modalBackdrop.querySelector(".modal").getBoundingClientRect();
  setModalSize(rect.width + widthDelta, rect.height + heightDelta);
}

function getDetailPanelWidthBounds() {
  const availableWidth = els.mainLayout.clientWidth || window.innerWidth;
  return {
    minWidth: MIN_DETAIL_PANEL_WIDTH,
    maxWidth: Math.max(MIN_DETAIL_PANEL_WIDTH, Math.min(MAX_DETAIL_PANEL_WIDTH, availableWidth - 360)),
  };
}

function getConfiguredDetailPanelWidth() {
  const configured = Number.parseFloat(els.mainLayout.style.getPropertyValue("--detail-width"));
  if (Number.isFinite(configured)) return configured;
  const rendered = els.detailPanel.getBoundingClientRect().width;
  return rendered > 42 ? rendered : 380;
}

function setDetailPanelWidth(width, options = {}) {
  const bounds = getDetailPanelWidthBounds();
  const nextWidth = Math.round(Math.max(bounds.minWidth, Math.min(bounds.maxWidth, Number(width) || 380)));
  els.mainLayout.style.setProperty("--detail-width", `${nextWidth}px`);
  els.detailResizeHandle.setAttribute("aria-valuemin", String(bounds.minWidth));
  els.detailResizeHandle.setAttribute("aria-valuemax", String(bounds.maxWidth));
  els.detailResizeHandle.setAttribute("aria-valuenow", String(nextWidth));
  if (options.persist) {
    try {
      localStorage.setItem(DETAIL_PANEL_WIDTH_STORAGE_KEY, String(nextWidth));
    } catch {
      // localStorage can be unavailable in private or restricted contexts.
    }
  }
  return nextWidth;
}

function loadDetailPanelWidth() {
  let savedWidth = 380;
  try {
    savedWidth = Number(localStorage.getItem(DETAIL_PANEL_WIDTH_STORAGE_KEY)) || 380;
  } catch {
    // Use the default width when localStorage is unavailable.
  }
  setDetailPanelWidth(savedWidth);
}

function startDetailResize(event) {
  if (event.button !== 0 || window.matchMedia("(max-width: 980px)").matches) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  state.detailResize = {
    startX: event.clientX,
    startWidth: getConfiguredDetailPanelWidth(),
    pointerId: event.pointerId,
    handle: event.currentTarget,
  };
  document.body.classList.add("detail-resizing");
  document.body.style.cursor = "col-resize";
}

function nudgeDetailPanelWidth(delta) {
  setDetailPanelWidth(getConfiguredDetailPanelWidth() + delta, { persist: true });
}

function getActiveResize() {
  return state.resize || state.modalSplitResize || state.modalResize || state.detailResize;
}

function applyPendingResize() {
  state.resizeFrame = 0;
  const point = state.pendingResizePoint;
  state.pendingResizePoint = null;
  if (!point) return;

  if (state.resize) {
    const delta = point.clientX - state.resize.startX;
    state.columnWidths[state.resize.column] = Math.max(
      MIN_COL_WIDTH,
      Math.min(MAX_COL_WIDTH, state.resize.startWidth + delta),
    );
    const headerCell = els.headerRow.querySelector(`.header-cell[data-column="${state.resize.column}"]`);
    if (headerCell) headerCell.style.flex = `0 0 ${state.columnWidths[state.resize.column]}px`;
    els.headerRow.style.width = `${getTotalWidth()}px`;
    renderRowsOnly();
  }
  if (state.modalSplitResize) {
    const delta = point.clientX - state.modalSplitResize.startX;
    setModalSourcePaneWidth(state.modalSplitResize.startWidth + delta);
  }
  if (state.modalResize) {
    const deltaX = point.clientX - state.modalResize.startX;
    const deltaY = point.clientY - state.modalResize.startY;
    setModalSize(state.modalResize.startWidth + deltaX, state.modalResize.startHeight + deltaY);
  }
  if (state.detailResize) {
    const delta = state.detailResize.startX - point.clientX;
    setDetailPanelWidth(state.detailResize.startWidth + delta);
  }
}

function onResizeMove(event) {
  const activeResize = getActiveResize();
  if (!activeResize || event.pointerId !== activeResize.pointerId) return;
  state.pendingResizePoint = { clientX: event.clientX, clientY: event.clientY };
  if (!state.resizeFrame) state.resizeFrame = requestAnimationFrame(applyPendingResize);
}

function stopResize(event) {
  const activeResize = getActiveResize();
  if (!activeResize) return;
  if (event?.pointerId != null && event.pointerId !== activeResize.pointerId) return;
  if (event?.type === "pointerup") {
    state.pendingResizePoint = { clientX: event.clientX, clientY: event.clientY };
  }
  if (state.resizeFrame) {
    cancelAnimationFrame(state.resizeFrame);
    applyPendingResize();
  } else if (state.pendingResizePoint) {
    applyPendingResize();
  }
  const hadModalResize = Boolean(state.modalSplitResize || state.modalResize);
  const hadDetailResize = Boolean(state.detailResize);
  if (activeResize.handle?.hasPointerCapture?.(activeResize.pointerId)) {
    activeResize.handle.releasePointerCapture(activeResize.pointerId);
  }
  state.resize = null;
  state.modalSplitResize = null;
  state.modalResize = null;
  state.detailResize = null;
  state.pendingResizePoint = null;
  if (hadModalResize) state.modalSuppressBackdropClickUntil = Date.now() + 250;
  if (hadDetailResize) setDetailPanelWidth(getConfiguredDetailPanelWidth(), { persist: true });
  document.body.classList.remove("detail-resizing");
  document.body.style.cursor = "";
}
