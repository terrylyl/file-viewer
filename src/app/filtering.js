function getVisibleColumnIndexes() {
  const order = state.columnOrder.length ? state.columnOrder : state.headers.map((_, index) => index);
  return order
    .filter((index) => state.visibleColumns[index]);
}

function getCurrentRowHeight() {
  return state.wrapCells ? WRAP_ROW_HEIGHT : ROW_HEIGHT;
}

function getCurrentHeaderHeight() {
  return window.matchMedia("(max-width: 980px)").matches ? 44 : HEADER_HEIGHT;
}

function getTotalWidth() {
  return (
    ROW_NUMBER_WIDTH +
    getVisibleColumnIndexes().reduce((sum, col) => sum + (state.columnWidths[col] || DEFAULT_COL_WIDTH), 0)
  );
}

function summarize(value) {
  const text = value == null ? "" : String(value);
  if (text.length <= PREVIEW_LIMIT) return { text, isLong: false };
  return {
    text: `文本过长，已截断显示，点击查看全文 · ${text.slice(0, PREVIEW_LIMIT)}`,
    isLong: true,
  };
}

function rowMatches(row) {
  const query = els.searchInput.value;
  if (!query) return false;
  const needle = normalizeForSearch(query, els.caseSensitiveInput.checked);
  const selectedColumn = Number(els.searchColumnSelect.value);
  if (selectedColumn >= 0) {
    return normalizeForSearch(row[selectedColumn] || "", els.caseSensitiveInput.checked).includes(needle);
  }
  for (const cell of row) {
    if (normalizeForSearch(cell, els.caseSensitiveInput.checked).includes(needle)) return true;
  }
  return false;
}

function getColumnUniqueValues(columnIndex) {
  return getCachedColumnUniqueValues(columnIndex);
}

function invalidateColumnValueCache(columnIndex = null) {
  if (columnIndex == null) {
    state.columnValueCache.clear();
    state.columnValuePending.clear();
    state.columnValueTokens.clear();
    return;
  }
  const cacheKey = String(columnIndex);
  state.columnValueCache.delete(cacheKey);
  state.columnValuePending.delete(cacheKey);
  state.columnValueTokens.delete(cacheKey);
}

function invalidateColumnProfileCache(columnIndex = null) {
  if (columnIndex == null) {
    state.columnProfileCache.clear();
    state.columnProfilePending.clear();
    state.columnProfileTokens.clear();
    return;
  }
  const cacheKey = String(columnIndex);
  state.columnProfileCache.delete(cacheKey);
  state.columnProfilePending.delete(cacheKey);
  state.columnProfileTokens.delete(cacheKey);
}

function computeColumnUniqueValuesSync(columnIndex) {
  const counts = new Map();
  for (const row of state.rows) {
    const value = row[columnIndex] == null ? "" : String(row[columnIndex]);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareCells(a.value, b.value));
}

function shouldUseAsyncColumnUniqueValues(columnIndex) {
  return (
    Number.isInteger(columnIndex) &&
    state.rows.length >= COLUMN_UNIQUE_WORKER_THRESHOLD &&
    canUseQueryWorker()
  );
}

function requestColumnUniqueValues(columnIndex) {
  const cacheKey = String(columnIndex);
  if (state.columnValuePending.has(cacheKey)) return;
  const token = state.columnValueTokenCounter + 1;
  state.columnValueTokenCounter = token;
  state.columnValuePending.add(cacheKey);
  state.columnValueTokens.set(cacheKey, token);
  const worker = isLargeDataMode() ? state.largeDataWorker : state.queryWorker;
  worker.postMessage({
    kind: "unique-values",
    token,
    ...(isLargeDataMode() ? {} : { version: state.queryRowsVersion }),
    columnIndex,
  });
}

function isColumnValuePending(columnIndex) {
  return state.columnValuePending.has(String(columnIndex));
}

function getCachedColumnUniqueValues(columnIndex) {
  const cacheKey = String(columnIndex);
  const cached = state.columnValueCache.get(cacheKey);
  if (cached) return cached;
  if (shouldUseAsyncColumnUniqueValues(columnIndex)) {
    requestColumnUniqueValues(columnIndex);
    return [];
  }
  const values = computeColumnUniqueValuesSync(columnIndex);
  state.columnValueCache.set(cacheKey, values);
  return values;
}

function getColumnFilter(columnIndex) {
  return state.columnFilters[String(columnIndex)] || null;
}

function hasColumnFilter(columnIndex) {
  return Boolean(getColumnFilter(columnIndex)) || state.duplicateFilters.has(columnIndex);
}

function hasColumnFilterCondition(filter) {
  return Boolean(normalizeColumnFilterCondition(filter?.condition));
}

function columnFilterConditionNeedsValue(type) {
  return type !== "" && type !== "empty" && type !== "non-empty" && type !== "duplicate";
}

function getColumnFilterConditionValueLabel(type) {
  if (type === "contains" || type === "not-contains") return "匹配文本";
  if (type === "regex") return "正则表达式";
  if (type === "profile-invalid") return "目标类型";
  if (type === "list-token-count-gte" || type === "distinct-list-token-count-gte") return "元素数阈值";
  if (type.startsWith("number-")) return "比较数值";
  return "参数";
}

function getColumnFilterConditionValuePlaceholder(type) {
  if (type === "contains" || type === "not-contains") return "输入要匹配的文本";
  if (type === "regex") return "例如 ^AB-\\d+$";
  if (type === "profile-invalid") return "number / date / text";
  if (type.startsWith("number-")) return "输入数字";
  if (type === "list-token-count-gte" || type === "distinct-list-token-count-gte") return "2";
  return "不需要参数";
}

function getColumnFilterConditionHint(type) {
  if (type === "duplicate") return "保留本列中出现至少两次的非空值行；重复范围按整份表格计算。";
  if (type === "empty") return "只保留空字符串或仅包含空白字符的单元格。";
  if (type === "non-empty") return "保留去除空白后仍有内容的单元格。";
  if (type === "profile-invalid") return "保留无法按列画像主要类型解析的非空单元格。";
  if (type === "contains" || type === "not-contains") return "文本条件默认不区分大小写。";
  if (type === "regex") return "输入 JavaScript 正则表达式；表达式无效时不会匹配行。";
  if (type === "list-token-count-gte" || type === "distinct-list-token-count-gte") return "自动识别 `[a,b,c]`、`a,b,c`、`e,f` 等列表值；无分隔符文本按单个元素处理。";
  if (type.startsWith("number-")) return "仅保留能按数字解析并满足比较条件的单元格。";
  return "可与下方值勾选同时生效。";
}

function getColumnFilterConditionLabel(condition) {
  const normalized = normalizeColumnFilterCondition(condition);
  if (!normalized) return "";
  if (normalized.type === "empty") return "空值";
  if (normalized.type === "non-empty") return "非空";
  if (normalized.type === "profile-invalid") return "画像异常值";
  if (normalized.type === "contains") return `包含“${normalized.value}”`;
  if (normalized.type === "not-contains") return `不包含“${normalized.value}”`;
  if (normalized.type === "regex") return `正则 /${normalized.value}/`;
  if (normalized.type === "list-token-count-gte") return `列表元素数 ≥ ${normalized.value}`;
  if (normalized.type === "distinct-list-token-count-gte") return `不同列表元素数 ≥ ${normalized.value}`;
  if (normalized.type === "number-gt") return `数值 > ${normalized.value}`;
  if (normalized.type === "number-gte") return `数值 ≥ ${normalized.value}`;
  if (normalized.type === "number-lt") return `数值 < ${normalized.value}`;
  if (normalized.type === "number-lte") return `数值 ≤ ${normalized.value}`;
  if (normalized.type === "number-eq") return `数值 = ${normalized.value}`;
  return "";
}

function cloneColumnFilter(filter) {
  if (!filter) return null;
  const condition = normalizeColumnFilterCondition(filter.condition);
  if (filter.allowedValues) return { mode: "include", values: new Set(filter.allowedValues), condition };
  return {
    mode: filter.mode === "exclude" ? "exclude" : filter.mode === "all" ? "all" : "include",
    values: new Set(filter.values || []),
    condition,
  };
}

function isColumnFilterValueSelected(columnIndex, value) {
  const filter = getColumnFilter(columnIndex);
  if (!filter) return true;
  if (filter.mode === "all") return true;
  if (filter.allowedValues) return filter.allowedValues.has(value);
  if (filter.mode === "exclude") return !filter.values.has(value);
  return filter.values.has(value);
}

function getColumnFilterSelectedCount(columnIndex, allValues) {
  const filter = getColumnFilter(columnIndex);
  if (!filter) return allValues.length;
  if (filter.mode === "all") return allValues.length;
  if (filter.allowedValues) return Math.min(filter.allowedValues.size, allValues.length);
  if (filter.mode === "exclude") return Math.max(0, allValues.length - filter.values.size);
  return Math.min(filter.values.size, allValues.length);
}

function normalizeColumnFilter(columnIndex, filter, allValues = getColumnUniqueValues(columnIndex)) {
  const key = String(columnIndex);
  const next = cloneColumnFilter(filter);
  if (!next) {
    delete state.columnFilters[key];
    return;
  }
  const hasCondition = hasColumnFilterCondition(next);
  if (next.mode === "all") {
    if (hasCondition) state.columnFilters[key] = next;
    else delete state.columnFilters[key];
    return;
  }
  if (next.mode === "exclude") {
    if (!next.values.size && !hasCondition) delete state.columnFilters[key];
    else state.columnFilters[key] = next;
    return;
  }
  const selectedEveryValue = allValues.length > 0 && allValues.every((item) => next.values.has(item.value));
  if (selectedEveryValue && !hasCondition) {
    delete state.columnFilters[key];
    return;
  }
  if (selectedEveryValue && hasCondition) {
    state.columnFilters[key] = { mode: "all", values: new Set(), condition: next.condition };
    return;
  }
  state.columnFilters[key] = next;
}

function updateColumnFilterValue(columnIndex, value, checked, allValues = getColumnUniqueValues(columnIndex)) {
  let next = cloneColumnFilter(getColumnFilter(columnIndex));
  if (!next) {
    if (checked) return;
    next = { mode: "exclude", values: new Set([value]) };
  } else if (next.mode === "all") {
    if (checked) return;
    next.mode = "exclude";
    next.values = new Set([value]);
  } else if (next.mode === "exclude") {
    if (checked) next.values.delete(value);
    else next.values.add(value);
  } else if (checked) {
    next.values.add(value);
  } else {
    next.values.delete(value);
  }
  normalizeColumnFilter(columnIndex, next, allValues);
}

function updateColumnFilterValues(columnIndex, items, checked, allValues = getColumnUniqueValues(columnIndex)) {
  if (checked && items.length === allValues.length) {
    const current = cloneColumnFilter(getColumnFilter(columnIndex));
    if (hasColumnFilterCondition(current)) {
      current.mode = "all";
      current.values = new Set();
      normalizeColumnFilter(columnIndex, current, allValues);
    } else {
      delete state.columnFilters[String(columnIndex)];
    }
    return;
  }
  const itemValues = items.map((item) => item.value);
  let next = cloneColumnFilter(getColumnFilter(columnIndex));
  if (!next) {
    if (checked) return;
    next = itemValues.length === allValues.length
      ? { mode: "include", values: new Set() }
      : { mode: "exclude", values: new Set(itemValues) };
  } else if (next.mode === "all") {
    if (checked) return;
    next.mode = itemValues.length === allValues.length ? "include" : "exclude";
    next.values = itemValues.length === allValues.length ? new Set() : new Set(itemValues);
  } else if (next.mode === "exclude") {
    for (const value of itemValues) {
      if (checked) next.values.delete(value);
      else next.values.add(value);
    }
  } else {
    for (const value of itemValues) {
      if (checked) next.values.add(value);
      else next.values.delete(value);
    }
  }
  normalizeColumnFilter(columnIndex, next, allValues);
}

function getActiveColumnFilters() {
  return Object.entries(state.columnFilters).map(([columnKey, filter]) => ({
    columnIndex: Number(columnKey),
    filter,
  }));
}

function clearColumnFilter(columnIndex) {
  if (columnIndex < 0) return;
  delete state.columnFilters[String(columnIndex)];
  state.duplicateFilters.delete(columnIndex);
}

function clearAllColumnFilters() {
  state.columnFilters = {};
  state.duplicateFilters = new Set();
}

function rowPassesHiddenRows(rowIndex) {
  return !state.hiddenRows.has(rowIndex);
}

function rebuildVisibleRowPositionMap() {
  if (isLargeDataMode()) {
    state.rowPositionMap = new Map();
    return;
  }
  state.rowPositionMap = new Map();
  state.viewIndices.forEach((rowIndex, position) => {
    state.rowPositionMap.set(rowIndex, position);
  });
}

function appendActiveFilterChip(label, onRemove) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "filter-chip";
  button.textContent = `${label}  ×`;
  button.title = `移除：${label}`;
  button.addEventListener("click", onRemove);
  els.activeFilterChips.appendChild(button);
}

function renderActiveFilterBar() {
  els.activeFilterChips.innerHTML = "";
  const searchActive = Boolean(els.searchInput.value && els.matchedOnlyInput.checked);
  if (searchActive) {
    const scope = Number(els.searchColumnSelect.value);
    const scopeLabel = scope >= 0 ? state.headers[scope] || `列 ${scope + 1}` : "全部列";
    appendActiveFilterChip(`搜索 · ${scopeLabel} · ${els.searchInput.value}`, () => {
      els.searchInput.value = "";
      els.matchedOnlyInput.checked = false;
      recomputeView();
      renderDetail();
    });
  }

  for (const [columnKey, filter] of Object.entries(state.columnFilters)) {
    const columnIndex = Number(columnKey);
    const header = state.headers[columnIndex] || `列 ${columnIndex + 1}`;
    const condition = getColumnFilterConditionLabel(normalizeColumnFilterCondition(filter?.condition));
    const valueLabel = filter?.mode === "include"
      ? `${filter.values?.size || 0} 个值`
      : filter?.mode === "exclude"
        ? `排除 ${filter.values?.size || 0} 个值`
        : "值筛选";
    appendActiveFilterChip(`${header} · ${condition || valueLabel}`, () => {
      delete state.columnFilters[String(columnIndex)];
      recomputeView();
    });
  }

  for (const columnIndex of state.duplicateFilters) {
    const header = state.headers[columnIndex] || `列 ${columnIndex + 1}`;
    appendActiveFilterChip(`${header} · 重复值`, () => {
      state.duplicateFilters.delete(columnIndex);
      recomputeView();
    });
  }

  if (state.hiddenRows.size) {
    appendActiveFilterChip(`排除 ${state.hiddenRows.size.toLocaleString()} 行`, showHiddenRows);
  }

  if (state.sort.column >= 0 && state.sort.direction !== "none") {
    const direction = state.sort.direction === "asc" ? "升序" : "降序";
    appendActiveFilterChip(`${state.headers[state.sort.column] || "列"} · ${direction}`, () => {
      state.sort = { column: -1, direction: "none" };
      recomputeView();
    });
  }


  const rowWindow = normalizeRowWindow(state.rowWindow);
  if (rowWindow.mode === "first") {
    appendActiveFilterChip(`前 ${rowWindow.count.toLocaleString()} 行`, clearRowWindow);
  } else if (rowWindow.mode === "range") {
    appendActiveFilterChip(`第 ${rowWindow.start.toLocaleString()}～${rowWindow.end.toLocaleString()} 行`, clearRowWindow);
  }

  const hasActiveItems = Boolean(els.activeFilterChips.children.length);
  els.activeFilterBar.classList.toggle("visible", hasActiveItems);
  els.activeFilterBar.setAttribute("aria-hidden", String(!hasActiveItems));
}

function renderFilteredRowStats() {
  const hiddenCount = state.hiddenRows.size;
  const filterCount = new Set([
    ...Object.keys(state.columnFilters),
    ...[...state.duplicateFilters].map(String),
  ]).size;
  const searchActive = Boolean(els.searchInput.value && els.matchedOnlyInput.checked);
  const rowWindowActive = normalizeRowWindow(state.rowWindow).mode !== "all";
  const parts = [`${state.viewIndices.length.toLocaleString()} / ${state.rows.length.toLocaleString()} 行`];
  if (filterCount) parts.push(`${filterCount} 列筛选`);
  if (searchActive) parts.push("搜索筛选");
  if (hiddenCount) parts.push(`排除 ${hiddenCount.toLocaleString()} 行`);
  if (rowWindowActive) parts.push("行范围");
  els.filteredRowStats.textContent = parts.join(" · ");
  els.filteredRowStats.classList.toggle("warning", filterCount > 0 || searchActive || hiddenCount > 0 || rowWindowActive);
  renderActiveFilterBar();
  updateExportPanel();
}

function computeViewSync(request = getViewQueryRequest()) {
  const query = els.searchInput.value;
  const matchedOnly = els.matchedOnlyInput.checked;
  const activeColumnFilters = getActiveColumnFilters();
  const duplicateCounts = new Map();
  for (const columnIndex of request.duplicateColumns || []) {
    duplicateCounts.set(Number(columnIndex), new Map());
  }
  if (duplicateCounts.size) {
    state.rows.forEach((row) => {
      for (const [columnIndex, counts] of duplicateCounts) {
        const value = row[columnIndex] == null ? "" : String(row[columnIndex]);
        if (!value.trim()) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    });
  }
  const matchedRows = [];
  const viewIndices = [];

  for (let index = 0; index < state.rows.length; index += 1) {
    const row = state.rows[index];
    if (!rowPassesHiddenRows(index)) continue;
    if (!rowPassesColumnFilters(row, activeColumnFilters)) continue;
    let passesDuplicateFilters = true;
    for (const [columnIndex, counts] of duplicateCounts) {
      const value = row[columnIndex] == null ? "" : String(row[columnIndex]);
      if (!value.trim() || (counts.get(value) || 0) < 2) {
        passesDuplicateFilters = false;
        break;
      }
    }
    if (!passesDuplicateFilters) continue;
    const hit = query ? rowMatches(row) : false;
    if (hit) matchedRows.push(index);
    if (!query || !matchedOnly || hit) viewIndices.push(index);
  }

  if (state.sort.column >= 0 && state.sort.direction !== "none") {
    const column = state.sort.column;
    const direction = state.sort.direction === "asc" ? 1 : -1;
    viewIndices.sort((a, b) => compareCells(state.rows[a][column], state.rows[b][column]) * direction);
  }

  return { viewIndices: applyRowWindow(viewIndices, request.rowWindow), matchedRows, request };
}

function applyQueryResult(result) {
  state.viewIndices = result.viewIndices && typeof result.viewIndices.length === "number" ? result.viewIndices : [];
  state.matchedRows = isLargeDataMode()
    ? result.matchedRows && typeof result.matchedRows.length === "number" ? result.matchedRows : new Uint32Array()
    : new Set(Array.isArray(result.matchedRows) ? result.matchedRows : []);
  rebuildVisibleRowPositionMap();
  normalizeSelectionForCurrentView();
  els.rightStatus.textContent = `${state.viewIndices.length} / ${state.rows.length} 行 · ${state.headers.length} 列`;
  renderFilteredRowStats();
  renderColumnOverview();
  renderGrid();
  renderDetail();
}

function recomputeView() {
  const request = getViewQueryRequest();
  if (runQueryInWorker(request)) return;
  applyQueryResult(computeViewSync(request));
}
