function trapManagedDialogFocus(event) {
  if (event.key !== "Tab") return;
  const backdrop = getOpenManagedDialog();
  if (!backdrop) return;
  const focusable = [...backdrop.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setPopoverTransformOrigin(popover, anchorRect) {
  if (!popover || !anchorRect || window.matchMedia("(max-width: 520px)").matches) return;
  const rect = popover.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(16, Math.min(rect.width - 16, anchorRect.left + anchorRect.width / 2 - rect.left));
  const y = anchorRect.bottom <= rect.top + rect.height / 2 ? 0 : rect.height;
  popover.style.setProperty("--popover-origin", `${x}px ${y}px`);
}

function closeColumnFilterMenu() {
  els.columnFilterPopover.classList.remove("open");
  els.columnFilterBackdrop.classList.remove("open");
  els.headerRow.querySelectorAll('.header-filter-button[aria-expanded="true"]')
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
  state.columnFilterMenu = { columnIndex: -1, query: "" };
}

function positionColumnFilterPopover(anchorRect) {
  if (!anchorRect) return;
  const popoverWidth = els.columnFilterPopover.offsetWidth || 360;
  const popoverHeight = els.columnFilterPopover.offsetHeight || 420;
  const margin = 8;
  const belowTop = anchorRect.bottom + 6;
  const aboveTop = anchorRect.top - popoverHeight - 6;
  const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - popoverWidth - margin));
  const top = belowTop + popoverHeight <= window.innerHeight - margin || aboveTop < margin
    ? Math.max(margin, Math.min(belowTop, window.innerHeight - popoverHeight - margin))
    : aboveTop;
  els.columnFilterPopover.style.left = `${left}px`;
  els.columnFilterPopover.style.top = `${top}px`;
}

function openColumnFilterMenu(anchor, columnIndex) {
  state.columnFilterMenu = { columnIndex, query: "" };
  els.columnFilterTitle.textContent = `${columnIndex + 1}. ${state.headers[columnIndex] || ""}`;
  els.columnFilterSearchInput.value = "";
  els.renameColumnInput.value = state.headers[columnIndex] || "";
  els.restoreColumnNameButton.disabled = state.headers[columnIndex] === state.originalHeaders[columnIndex];
  els.deleteCustomColumnButton.disabled = !isCustomColumn(columnIndex);
  els.deleteCustomColumnButton.title = isCustomColumn(columnIndex) ? "删除此自定义列" : "原始导入列不能删除";
  const rect = anchor.getBoundingClientRect();
  els.columnFilterPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 370))}px`;
  els.columnFilterPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 420))}px`;
  closeAddColumnPopover();
  closeConcatenateColumnPopover();
  els.columnsPopover.classList.remove("open");
  els.columnsButton.setAttribute("aria-expanded", "false");
  els.columnFilterPopover.classList.add("open");
  els.columnFilterBackdrop.classList.add("open");
  anchor.setAttribute("aria-expanded", "true");
  renderColumnFilterValues();
  positionColumnFilterPopover(rect);
  setPopoverTransformOrigin(els.columnFilterPopover, rect);
  els.columnFilterSearchInput.focus();
}

function getMenuFilteredValues(allValues = null) {
  const columnIndex = state.columnFilterMenu.columnIndex;
  if (columnIndex < 0) return [];
  const query = state.columnFilterMenu.query;
  const values = allValues || getColumnUniqueValues(columnIndex);
  if (!query) return values;
  const needle = normalizeForSearch(query, els.caseSensitiveInput.checked);
  return values.filter((item) => normalizeForSearch(item.value, els.caseSensitiveInput.checked).includes(needle));
}

function getConditionMatchedValues(columnIndex, values) {
  if (state.duplicateFilters.has(columnIndex)) {
    return values.filter((item) => item.value.trim() !== "" && item.count > 1);
  }
  const condition = normalizeColumnFilterCondition(getColumnFilter(columnIndex)?.condition);
  return condition ? values.filter((item) => evaluateColumnFilterCondition(item.value, condition)) : values;
}

function syncColumnFilterConditionControls(columnIndex) {
  const filter = getColumnFilter(columnIndex);
  const condition = normalizeColumnFilterCondition(filter?.condition);
  const type = state.duplicateFilters.has(columnIndex) ? "duplicate" : condition?.type || "";
  els.columnConditionOperatorSelect.value = type;
  els.columnConditionValueInput.value = condition?.value || "";
  els.columnConditionValueInput.disabled = !columnFilterConditionNeedsValue(type);
  els.columnConditionValueLabelText.textContent = getColumnFilterConditionValueLabel(type);
  els.columnConditionValueInput.placeholder = getColumnFilterConditionValuePlaceholder(type);
  els.columnConditionHint.textContent = getColumnFilterConditionHint(type);
}

function updateColumnConditionFilter(columnIndex, options = {}) {
  if (columnIndex < 0) return;
  const type = els.columnConditionOperatorSelect.value;
  const value = columnFilterConditionNeedsValue(type) ? els.columnConditionValueInput.value : "";
  const allValues = getColumnUniqueValues(columnIndex);
  const next = cloneColumnFilter(getColumnFilter(columnIndex)) || { mode: "all", values: new Set() };
  if (type === "duplicate") {
    state.duplicateFilters.add(columnIndex);
    next.condition = null;
  } else {
    state.duplicateFilters.delete(columnIndex);
    next.condition = normalizeColumnFilterCondition({ type, value });
  }
  normalizeColumnFilter(columnIndex, next, allValues);
  recomputeView();
  renderColumnFilterValues({ syncControls: !options.keepDraftControls });
}

function renderColumnFilterValues(options = {}) {
  const syncControls = options.syncControls !== false;
  const columnIndex = state.columnFilterMenu.columnIndex;
  els.columnFilterValues.innerHTML = "";
  if (columnIndex < 0) {
    els.columnFilterSummary.textContent = "未选择列";
    if (syncControls) {
      els.columnConditionOperatorSelect.value = "";
      els.columnConditionValueInput.value = "";
      els.columnConditionValueInput.disabled = true;
      els.columnConditionValueLabelText.textContent = getColumnFilterConditionValueLabel("");
      els.columnConditionValueInput.placeholder = getColumnFilterConditionValuePlaceholder("");
      els.columnConditionHint.textContent = getColumnFilterConditionHint("");
    }
    return;
  }
  if (syncControls) syncColumnFilterConditionControls(columnIndex);

  const allValues = getColumnUniqueValues(columnIndex);
  const conditionMatchedValues = getConditionMatchedValues(columnIndex, allValues);
  const visibleValues = getConditionMatchedValues(columnIndex, getMenuFilteredValues(allValues));
  const shownValues = visibleValues.slice(0, 500);
  if (isColumnValuePending(columnIndex) && !allValues.length) {
    els.columnFilterSummary.textContent = "正在统计本列值...";
    const loading = document.createElement("div");
    loading.className = "filter-summary";
    loading.style.padding = "10px";
    loading.textContent = "正在统计本列值，完成后会自动刷新";
    els.columnFilterValues.appendChild(loading);
    return;
  }
  const filter = getColumnFilter(columnIndex);
  const duplicateCondition = state.duplicateFilters.has(columnIndex);
  const condition = duplicateCondition
    ? { type: "duplicate" }
    : normalizeColumnFilterCondition(filter?.condition);
  const selectedCount = condition
    ? conditionMatchedValues.filter((item) => isColumnFilterValueSelected(columnIndex, item.value)).length
    : getColumnFilterSelectedCount(columnIndex, allValues);
  const totalCount = condition ? conditionMatchedValues.length : allValues.length;
  const conditionLabel = duplicateCondition ? "重复值" : getColumnFilterConditionLabel(condition);
  const conditionText = conditionLabel ? `，条件：${conditionLabel}` : "";
  els.columnFilterSummary.textContent = `已选择 ${selectedCount} / ${totalCount} 个值，当前显示 ${shownValues.length} 个${conditionText}`;

  if (!shownValues.length) {
    const empty = document.createElement("div");
    empty.className = "filter-summary";
    empty.style.padding = "10px";
    empty.textContent = "没有匹配的值";
    els.columnFilterValues.appendChild(empty);
    return;
  }

  for (const item of shownValues) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isColumnFilterValueSelected(columnIndex, item.value);
    checkbox.addEventListener("change", () => {
      updateColumnFilterValue(columnIndex, item.value, checkbox.checked, allValues);
      recomputeView();
      renderColumnFilterValues();
    });

    const valueText = document.createElement("span");
    valueText.className = "filter-value-text";
    valueText.title = item.value;
    valueText.textContent = item.value === "" ? "(空白)" : item.value;

    const count = document.createElement("span");
    count.className = "filter-value-count";
    count.textContent = String(item.count);

    label.append(checkbox, valueText, count);
    els.columnFilterValues.appendChild(label);
  }
}

function updateFilterValuesForVisible(checked) {
  const columnIndex = state.columnFilterMenu.columnIndex;
  if (columnIndex < 0) return;
  const allValues = getColumnUniqueValues(columnIndex);
  updateColumnFilterValues(columnIndex, getConditionMatchedValues(columnIndex, getMenuFilteredValues(allValues)), checked, allValues);
  recomputeView();
  renderColumnFilterValues();
}

function clearCurrentColumnFilter() {
  const columnIndex = state.columnFilterMenu.columnIndex;
  if (columnIndex < 0) return;
  clearColumnFilter(columnIndex);
  recomputeView();
  renderColumnFilterValues();
}

function hideRowsByCurrentColumnFilter() {
  excludeRows(state.viewIndices, "当前结果");
  closeColumnFilterMenu();
}

function excludeRows(rowIndexes, sourceLabel = "所选") {
  const rowsToHide = [...new Set(rowIndexes || [])].filter((rowIndex) => Number.isInteger(rowIndex));
  if (!rowsToHide.length) return;
  const previousHiddenRows = new Set(state.hiddenRows);
  for (const rowIndex of rowsToHide) {
    state.hiddenRows.add(rowIndex);
  }
  recomputeView();
  showToast(`已从${sourceLabel}中排除 ${rowsToHide.length.toLocaleString()} 行`, {
    actionLabel: "撤销",
    onAction: () => {
      state.hiddenRows = previousHiddenRows;
      recomputeView();
    },
  });
}

function getSelectedRowIndexes() {
  const endpoints = getSelectionEndpoints();
  if (!endpoints) return [];
  return state.viewIndices.slice(endpoints.startRowPosition, endpoints.endRowPosition + 1);
}

function excludeSelectedRows() {
  excludeRows(getSelectedRowIndexes());
}

function excludeSelectedRow() {
  if (!state.selected) return;
  excludeRows([state.selected.rowIndex], "当前视图");
}

function showHiddenRows() {
  const previousHiddenRows = new Set(state.hiddenRows);
  const restoredCount = previousHiddenRows.size;
  state.hiddenRows = new Set();
  recomputeView();
  renderColumnFilterValues();
  if (restoredCount) {
    showToast(`已恢复 ${restoredCount.toLocaleString()} 个已排除行`, {
      actionLabel: "撤销",
      onAction: () => {
        state.hiddenRows = previousHiddenRows;
        recomputeView();
      },
    });
  }
}

function clearAllFilters() {
  clearAllColumnFilters();
  state.hiddenRows = new Set();
  state.rowWindow = { mode: "all" };
  state.sort = { column: -1, direction: "none" };
  els.searchInput.value = "";
  els.searchColumnSelect.value = "-1";
  els.matchedOnlyInput.checked = false;
  closeColumnFilterMenu();
  closeRowFilterPopover();
  recomputeView();
  renderDetail();
  showToast("已清除筛选、搜索和排序");
}

function updateSearchColumns() {
  const selectedValue = els.searchColumnSelect.value;
  els.searchColumnSelect.innerHTML = '<option value="-1">全部列</option>';
  state.headers.forEach((header, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${header}`;
    els.searchColumnSelect.appendChild(option);
  });
  const selectedIndex = Number(selectedValue);
  els.searchColumnSelect.value =
    selectedValue === "-1" || (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < state.headers.length)
      ? selectedValue
      : "-1";
}

function renderColumnPopover() {
  els.columnList.innerHTML = "";
  state.headers.forEach((header, index) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.visibleColumns[index];
    checkbox.addEventListener("change", () => {
      state.visibleColumns[index] = checkbox.checked;
      renderGrid();
    });
    const text = document.createElement("span");
    text.textContent = `${index + 1}. ${header}`;
    label.append(checkbox, text);
    els.columnList.appendChild(label);
  });
}

function renderColumnOverview() {
  els.columnOverview.innerHTML = "";
  if (!state.headers.length) {
    const empty = document.createElement("span");
    empty.className = "pill";
    empty.textContent = "未加载列";
    els.columnOverview.appendChild(empty);
    return;
  }

  state.headers.forEach((header, index) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `pill column-profile-trigger${hasColumnFilter(index) ? " warning" : ""}`;
    pill.title = `查看“${header}”的列画像`;
    pill.textContent = `${index + 1}. ${header}`;
    pill.addEventListener("click", () => openColumnProfile(index));
    els.columnOverview.appendChild(pill);
  });
}

function getNextColumnName() {
  const used = new Set(state.headers);
  let index = state.headers.length + 1;
  let name = `新列 ${index}`;
  while (used.has(name)) {
    index += 1;
    name = `新列 ${index}`;
  }
  return name;
}

function getColumnOptionLabel(index) {
  const name = state.headers[index] || `Column ${index + 1}`;
  return `${index + 1}. ${name}`;
}

function normalizeConcatenateScheme(raw) {
  if (!raw || typeof raw !== "object") return null;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => ({
          sourceName: String(item.sourceName || "").trim(),
          alias: String(item.alias || "").trim(),
        }))
        .filter((item) => item.sourceName)
    : [];
  if (!items.length) return null;
  const outputName = String(raw.outputName || raw.name || "").trim() || "用户问题";
  const scheme = {
    name: String(raw.name || outputName).trim() || outputName,
    outputName,
    items,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  scheme.signature = getConcatenateSchemeSignature(scheme);
  return scheme;
}

function getConcatenateSchemeSignature(scheme) {
  return JSON.stringify({
    outputName: String(scheme.outputName || "").trim(),
    items: (scheme.items || []).map((item) => ({
      sourceName: String(item.sourceName || "").trim(),
      alias: String(item.alias || "").trim(),
    })),
  });
}

function getConcatenateSchemeLabel(scheme) {
  const sources = (scheme.items || []).map((item) => item.sourceName).filter(Boolean).join(" + ");
  return `${scheme.outputName || scheme.name || "用户问题"} · ${sources || "未命名方案"}`;
}

function loadConcatenateSchemes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONCATENATE_SCHEMES_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeConcatenateScheme)
      .filter(Boolean)
      .slice(0, MAX_CONCATENATE_SCHEMES);
  } catch (error) {
    return [];
  }
}

function persistConcatenateSchemes(schemes) {
  try {
    localStorage.setItem(CONCATENATE_SCHEMES_STORAGE_KEY, JSON.stringify(schemes.slice(0, MAX_CONCATENATE_SCHEMES)));
  } catch (error) {
    // localStorage can be unavailable in private or restricted contexts.
  }
}

function buildConcatenateSchemeFromSelection({ name, items }) {
  const outputName = String(name || "").trim() || "用户问题";
  const scheme = {
    name: outputName,
    outputName,
    items: items.map((item) => ({
      sourceName: state.headers[item.columnIndex] || `Column ${item.columnIndex + 1}`,
      alias: String(item.alias || "").trim() || state.headers[item.columnIndex] || `Column ${item.columnIndex + 1}`,
    })),
    updatedAt: Date.now(),
  };
  scheme.signature = getConcatenateSchemeSignature(scheme);
  return scheme;
}

function saveConcatenateScheme({ name, items }) {
  if (!items?.length) return;
  const scheme = buildConcatenateSchemeFromSelection({ name, items });
  const schemes = [scheme, ...loadConcatenateSchemes().filter((item) => item.signature !== scheme.signature)]
    .slice(0, MAX_CONCATENATE_SCHEMES);
  state.concatenateSchemes = schemes;
  persistConcatenateSchemes(schemes);
  if (els.concatenateColumnPopover.classList.contains("open")) renderConcatenateSchemeOptions();
}

function renderConcatenateSchemeOptions() {
  els.concatenateSchemeSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.concatenateSchemes.length ? "选择已保存方案" : "暂无可复用方案";
  els.concatenateSchemeSelect.appendChild(placeholder);
  state.concatenateSchemes.forEach((scheme) => {
    const option = document.createElement("option");
    option.value = scheme.signature;
    option.textContent = getConcatenateSchemeLabel(scheme);
    els.concatenateSchemeSelect.appendChild(option);
  });
  els.concatenateSchemeSelect.disabled = !state.concatenateSchemes.length;
  els.applyConcatenateSchemeButton.disabled = !state.concatenateSchemes.length;
}

function applyConcatenateScheme() {
  const signature = els.concatenateSchemeSelect.value;
  const scheme = state.concatenateSchemes.find((item) => item.signature === signature);
  if (!scheme) return;
  els.concatenateColumnNameInput.value = scheme.outputName || scheme.name || "用户问题";
  state.concatenateColumnItems = scheme.items.map((item) => {
    const sourceName = String(item.sourceName || "").trim();
    const matches = state.headers
      .map((header, headerIndex) => ({ header, headerIndex }))
      .filter(({ header }) => header === sourceName);
    return {
      columnIndex: matches[0]?.headerIndex ?? 0,
      manualName: matches.length === 1 ? "" : sourceName,
      alias: String(item.alias || "").trim() || sourceName,
    };
  });
  if (!state.concatenateColumnItems.length) state.concatenateColumnItems = [createDefaultConcatenateItem(0)];
  renderConcatenateRows();
  const resolved = resolveConcatenateItems(state.concatenateColumnItems);
  setConcatenateValidation(resolved.errors);
}

function createDefaultConcatenateItem(columnIndex = 0) {
  const index = Math.max(0, Math.min(Number(columnIndex) || 0, Math.max(0, state.headers.length - 1)));
  return {
    columnIndex: index,
    manualName: "",
    alias: state.headers[index] || `Column ${index + 1}`,
  };
}

function setConcatenateValidation(errors = []) {
  els.concatenateValidationStatus.textContent = errors.join("\n");
}

function buildConcatenatedValue(items, row) {
  const markdownFence = "```markdown";
  const closingFence = "```";
  return items
    .map((item) => {
      const alias = item.alias || state.headers[item.columnIndex] || `Column ${item.columnIndex + 1}`;
      const value = row[item.columnIndex] == null ? "" : String(row[item.columnIndex]);
      return `# ${alias}\n${markdownFence}\n${value}\n${closingFence}`;
    })
    .join("\n\n");
}

function resolveConcatenateItems(items) {
  const errors = [];
  const resolved = [];
  items.forEach((item, index) => {
    const rowNumber = index + 1;
    const manualName = String(item.manualName || "").trim();
    let columnIndex = Number(item.columnIndex);
    if (manualName) {
      const matches = state.headers
        .map((header, headerIndex) => ({ header, headerIndex }))
        .filter(({ header }) => header === manualName);
      if (!matches.length) {
        errors.push(`第 ${rowNumber} 行：未找到列名「${manualName}」`);
        return;
      }
      if (matches.length > 1) {
        errors.push(`第 ${rowNumber} 行：列名「${manualName}」重复，请用下拉框精确选择`);
        return;
      }
      columnIndex = matches[0].headerIndex;
    }
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= state.headers.length) {
      errors.push(`第 ${rowNumber} 行：请选择有效列`);
      return;
    }
    resolved.push({
      columnIndex,
      alias: String(item.alias || "").trim() || state.headers[columnIndex] || `Column ${columnIndex + 1}`,
    });
  });
  if (!resolved.length && !errors.length) errors.push("请至少添加一个拼接项");
  return { items: resolved, errors };
}

function refreshColumnDependentViews() {
  updateSearchColumns();
  renderColumnPopover();
  renderColumnOverview();
  updateFileStats();
  renderGrid();
  renderDetail();
  if (els.concatenateColumnPopover.classList.contains("open")) renderConcatenateRows();
}

function updateCopyColumnOptions() {
  els.copyColumnSelect.innerHTML = "";
  state.headers.forEach((header, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = getColumnOptionLabel(index);
    els.copyColumnSelect.appendChild(option);
  });
  els.copyColumnSelect.disabled = els.newColumnModeSelect.value !== "copy" || !state.headers.length;
}

function syncNewColumnMode() {
  updateCopyColumnOptions();
  const isConstant = els.newColumnModeSelect.value === "constant";
  els.constantColumnValueLabel.hidden = !isConstant;
  els.constantColumnValueInput.disabled = !isConstant;
}

function openAddColumnPopover(anchor) {
  if (!state.headers.length) return;
  els.newColumnNameInput.value = getNextColumnName();
  els.newColumnModeSelect.value = "empty";
  els.constantColumnValueInput.value = "";
  syncNewColumnMode();
  const rect = anchor.getBoundingClientRect();
  els.addColumnPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
  els.addColumnPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260))}px`;
  els.columnsPopover.classList.remove("open");
  els.columnsButton.setAttribute("aria-expanded", "false");
  closeClipboardImportPopover();
  closeConcatenateColumnPopover();
  closeColumnFilterMenu();
  closeContextMenu();
  els.addColumnPopover.classList.add("open");
  els.addColumnButton.setAttribute("aria-expanded", "true");
  setPopoverTransformOrigin(els.addColumnPopover, rect);
  els.newColumnNameInput.focus();
  els.newColumnNameInput.select();
}

function closeAddColumnPopover() {
  els.addColumnPopover.classList.remove("open");
  els.addColumnButton.setAttribute("aria-expanded", "false");
}

function getConcatenateMotionId(item) {
  if (!concatenateMotionIds.has(item)) {
    concatenateMotionId += 1;
    concatenateMotionIds.set(item, `concatenate-${concatenateMotionId}`);
  }
  return concatenateMotionIds.get(item);
}

function captureConcatenateRowRects() {
  const positions = new Map();
  for (const row of els.concatenateRows.querySelectorAll(".concatenate-row")) {
    positions.set(row.dataset.motionId, row.getBoundingClientRect().top);
  }
  return positions;
}

function animateConcatenateRowLayout(previousRects = new Map(), enteringMotionId = "") {
  if (!window.matchMedia("(min-width: 981px)").matches) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const row of els.concatenateRows.querySelectorAll(".concatenate-row")) {
    const motionId = row.dataset.motionId;
    if (motionId === enteringMotionId) {
      row.classList.add("entering");
      row.getBoundingClientRect();
      requestAnimationFrame(() => row.isConnected && row.classList.remove("entering"));
      continue;
    }
    const previousTop = previousRects.get(motionId);
    if (reduceMotion || !Number.isFinite(previousTop)) continue;
    const delta = previousTop - row.getBoundingClientRect().top;
    if (Math.abs(delta) < 0.5) continue;
    row.style.transition = "none";
    row.style.transform = `translateY(${delta}px)`;
    row.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (!row.isConnected) return;
      row.style.removeProperty("transition");
      row.style.removeProperty("transform");
    });
  }
}

function removeConcatenateRow(index) {
  if (state.concatenateColumnItems.length <= 1) return;
  const item = state.concatenateColumnItems[index];
  const motionId = getConcatenateMotionId(item);
  const row = els.concatenateRows.querySelector(`.concatenate-row[data-motion-id="${motionId}"]`);
  const finish = () => {
    const currentIndex = state.concatenateColumnItems.indexOf(item);
    if (currentIndex < 0) return;
    const previousRects = captureConcatenateRowRects();
    state.concatenateColumnItems.splice(currentIndex, 1);
    setConcatenateValidation();
    renderConcatenateRows({ previousRects });
  };
  if (!row || !window.matchMedia("(min-width: 981px)").matches) {
    finish();
    return;
  }
  let finished = false;
  let fallbackTimer = 0;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(fallbackTimer);
    row.removeEventListener("transitionend", handleTransitionEnd);
    finish();
  };
  const handleTransitionEnd = (event) => {
    if (event.propertyName === "opacity") finishOnce();
  };
  row.addEventListener("transitionend", handleTransitionEnd);
  row.classList.add("removing");
  fallbackTimer = window.setTimeout(finishOnce, 180);
}

function renderConcatenateRows(options = {}) {
  if (!state.concatenateColumnItems.length && state.headers.length) {
    state.concatenateColumnItems = [createDefaultConcatenateItem(0)];
  }
  els.concatenateRows.innerHTML = "";
  state.concatenateColumnItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "concatenate-row";
    const motionId = getConcatenateMotionId(item);
    row.dataset.motionId = motionId;
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const fromIndex = state.concatenateDragIndex >= 0 ? state.concatenateDragIndex : Number(event.dataTransfer.getData("text/plain"));
      if (!Number.isInteger(fromIndex) || fromIndex === index) return;
      const previousRects = captureConcatenateRowRects();
      const [moved] = state.concatenateColumnItems.splice(fromIndex, 1);
      state.concatenateColumnItems.splice(index, 0, moved);
      state.concatenateDragIndex = -1;
      renderConcatenateRows({ previousRects });
    });

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.title = "拖拽调整顺序";
    handle.textContent = "↕";
    handle.draggable = true;
    handle.addEventListener("dragstart", (event) => {
      state.concatenateDragIndex = index;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    });
    handle.addEventListener("dragend", () => {
      state.concatenateDragIndex = -1;
    });

    const select = document.createElement("select");
    select.title = "精确选择列";
    state.headers.forEach((header, columnIndex) => {
      const option = document.createElement("option");
      option.value = String(columnIndex);
      option.textContent = getColumnOptionLabel(columnIndex);
      select.appendChild(option);
    });
    select.value = String(item.columnIndex);
    select.addEventListener("change", () => {
      const previousDefaultAlias = state.headers[item.columnIndex] || "";
      item.columnIndex = Number(select.value);
      if (!item.alias || item.alias === previousDefaultAlias) item.alias = state.headers[item.columnIndex] || "";
      item.manualName = "";
      manualInput.value = "";
      aliasInput.value = item.alias;
      setConcatenateValidation();
    });

    const manualInput = document.createElement("input");
    manualInput.type = "text";
    manualInput.placeholder = "手动输入列名";
    manualInput.value = item.manualName || "";
    manualInput.addEventListener("input", () => {
      item.manualName = manualInput.value;
      const matches = state.headers
        .map((header, headerIndex) => ({ header, headerIndex }))
        .filter(({ header }) => header === manualInput.value.trim());
      if (matches.length === 1) {
        item.columnIndex = matches[0].headerIndex;
        select.value = String(item.columnIndex);
      }
      setConcatenateValidation();
    });

    const aliasInput = document.createElement("input");
    aliasInput.type = "text";
    aliasInput.placeholder = "别名";
    aliasInput.value = item.alias || "";
    aliasInput.addEventListener("input", () => {
      item.alias = aliasInput.value;
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-button danger";
    deleteButton.title = "删除拼接项";
    deleteButton.textContent = "×";
    deleteButton.disabled = state.concatenateColumnItems.length <= 1;
    deleteButton.addEventListener("click", () => {
      removeConcatenateRow(index);
    });

    row.append(handle, select, manualInput, aliasInput, deleteButton);
    els.concatenateRows.appendChild(row);
  });
  animateConcatenateRowLayout(options.previousRects, options.enteringMotionId);
}

function openConcatenateColumnPopover(anchor) {
  if (!state.headers.length) return;
  state.concatenateSchemes = loadConcatenateSchemes();
  els.concatenateColumnNameInput.value = "用户问题";
  state.concatenateColumnItems = [createDefaultConcatenateItem(0)];
  setConcatenateValidation();
  renderConcatenateSchemeOptions();
  renderConcatenateRows();
  const rect = anchor.getBoundingClientRect();
  els.concatenateColumnPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 780))}px`;
  els.concatenateColumnPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 460))}px`;
  els.columnsPopover.classList.remove("open");
  els.columnsButton.setAttribute("aria-expanded", "false");
  closeClipboardImportPopover();
  closeAddColumnPopover();
  closeColumnFilterMenu();
  closeContextMenu();
  els.concatenateColumnPopover.classList.add("open");
  els.concatenateColumnButton.setAttribute("aria-expanded", "true");
  setPopoverTransformOrigin(els.concatenateColumnPopover, rect);
  els.concatenateColumnNameInput.focus();
  els.concatenateColumnNameInput.select();
}

function closeConcatenateColumnPopover() {
  els.concatenateColumnPopover.classList.remove("open");
  els.concatenateColumnButton.setAttribute("aria-expanded", "false");
  setConcatenateValidation();
}

function reindexColumnSet(columns, removedColumnIndex) {
  const next = new Set();
  for (const columnIndex of columns) {
    if (columnIndex < removedColumnIndex) next.add(columnIndex);
    if (columnIndex > removedColumnIndex) next.add(columnIndex - 1);
  }
  return next;
}

function reindexColumnFilters(filters, removedColumnIndex) {
  const next = {};
  for (const [columnKey, filter] of Object.entries(filters)) {
    const columnIndex = Number(columnKey);
    if (columnIndex === removedColumnIndex) continue;
    const nextIndex = columnIndex > removedColumnIndex ? columnIndex - 1 : columnIndex;
    next[String(nextIndex)] = cloneColumnFilter(filter);
  }
  return next;
}

function reindexCellMeta(cellMeta, removedColumnIndex) {
  const next = new Map();
  for (const [key, meta] of cellMeta.entries()) {
    const [rowPart, columnPart] = key.split(":");
    const columnIndex = Number(columnPart);
    if (columnIndex === removedColumnIndex) continue;
    const nextColumnIndex = columnIndex > removedColumnIndex ? columnIndex - 1 : columnIndex;
    next.set(`${rowPart}:${nextColumnIndex}`, meta);
  }
  return next;
}

function reindexColumnOrder(order, removedColumnIndex) {
  return order
    .filter((columnIndex) => columnIndex !== removedColumnIndex)
    .map((columnIndex) => (columnIndex > removedColumnIndex ? columnIndex - 1 : columnIndex));
}

function normalizeSelectionAfterColumnDelete(removedColumnIndex) {
  if (!state.selected) return;
  if (!state.headers.length || !state.rows.length) {
    state.selected = null;
    return;
  }
  const rowIndex = Math.min(state.selected.rowIndex, state.rows.length - 1);
  let columnIndex = state.selected.columnIndex;
  if (columnIndex === removedColumnIndex) columnIndex = Math.min(removedColumnIndex, state.headers.length - 1);
  else if (columnIndex > removedColumnIndex) columnIndex -= 1;
  state.selected = { rowIndex, columnIndex };
  clearSelectionToSelected();
}

function addDerivedColumn({ name, mode, sourceColumnIndex, constantValue }) {
  if (!state.headers.length) return;
  const columnIndex = state.headers.length;
  const columnName = String(name || "").trim() || getNextColumnName();
  state.headers.push(columnName);
  state.originalHeaders.push(columnName);

  const source = Number(sourceColumnIndex);
  const shouldCopy = mode === "copy" && Number.isInteger(source) && source >= 0 && source < columnIndex;
  const sharedValue = String(constantValue ?? "");
  state.rows.forEach((row, rowIndex) => {
    if (mode === "sequence") {
      row[columnIndex] = String(rowIndex + 1);
    } else if (shouldCopy) {
      row[columnIndex] = row[source] == null ? "" : String(row[source]);
    } else if (mode === "constant") {
      row[columnIndex] = sharedValue;
    } else {
      row[columnIndex] = "";
    }
  });

  if (shouldCopy && state.cellMeta?.size) {
    const nextMeta = new Map(state.cellMeta);
    for (let rowIndex = 0; rowIndex < state.rows.length; rowIndex += 1) {
      const meta = nextMeta.get(`${rowIndex}:${source}`);
      if (meta) nextMeta.set(`${rowIndex}:${columnIndex}`, { ...meta });
    }
    state.cellMeta = nextMeta;
  }

  state.visibleColumns[columnIndex] = true;
  state.customColumns.add(columnIndex);
  state.columnOrder = state.columnOrder.length
    ? [...state.columnOrder, columnIndex]
    : state.headers.map((_, index) => index);
  state.columnWidths[columnIndex] = Math.max(
    MIN_COL_WIDTH,
    Math.min(MAX_COL_WIDTH, Math.max(DEFAULT_COL_WIDTH, columnName.length * 10 + 36)),
  );
  invalidateColumnValueCache();
  invalidateColumnProfileCache();
  state.cellVersions = new Map();
  invalidateCellRenderCache();
  state.issues = analyzeRows(state.headers, state.rows);
  state.selected = state.rows.length ? { rowIndex: 0, columnIndex } : null;
  clearSelectionToSelected();
  seedQueryWorker();
  updateSearchColumns();
  renderColumnPopover();
  renderColumnOverview();
  updateFileStats();
  recomputeView();
  renderDetail();
  closeAddColumnPopover();
  els.leftStatus.textContent = `已添加列：${columnName}`;
}

function addConcatenatedColumn({ name, items }) {
  if (!state.headers.length || !items.length) return;
  const columnIndex = state.headers.length;
  const columnName = String(name || "").trim() || "用户问题";
  saveConcatenateScheme({ name: columnName, items });
  state.headers.push(columnName);
  state.originalHeaders.push(columnName);
  state.rows.forEach((row) => {
    row[columnIndex] = buildConcatenatedValue(items, row);
  });
  state.visibleColumns[columnIndex] = true;
  state.customColumns.add(columnIndex);
  state.columnOrder = state.columnOrder.length
    ? [...state.columnOrder, columnIndex]
    : state.headers.map((_, index) => index);
  state.columnWidths[columnIndex] = Math.max(
    MIN_COL_WIDTH,
    Math.min(MAX_COL_WIDTH, Math.max(DEFAULT_COL_WIDTH, columnName.length * 10 + 36)),
  );
  invalidateColumnValueCache();
  invalidateColumnProfileCache();
  state.cellVersions = new Map();
  invalidateCellRenderCache();
  state.issues = analyzeRows(state.headers, state.rows);
  state.selected = state.rows.length ? { rowIndex: 0, columnIndex } : null;
  clearSelectionToSelected();
  seedQueryWorker();
  recomputeView();
  refreshColumnDependentViews();
  closeConcatenateColumnPopover();
  els.leftStatus.textContent = `已生成拼接列：${columnName}`;
}

function renameColumn(columnIndex, name) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= state.headers.length) return;
  const nextName = String(name || "").trim() || `Column ${columnIndex + 1}`;
  state.headers[columnIndex] = nextName;
  state.issues = {
    ...state.issues,
    duplicateColumns: detectDuplicateHeaderIssues(state.headers),
  };
  if (state.columnFilterMenu.columnIndex === columnIndex) {
    els.columnFilterTitle.textContent = `${columnIndex + 1}. ${nextName}`;
    els.renameColumnInput.value = nextName;
    els.restoreColumnNameButton.disabled = nextName === state.originalHeaders[columnIndex];
  }
  refreshColumnDependentViews();
  renderColumnFilterValues();
  els.leftStatus.textContent = `已重命名列：${nextName}`;
}

function restoreColumnName(columnIndex) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= state.headers.length) return;
  renameColumn(columnIndex, state.originalHeaders[columnIndex] || `Column ${columnIndex + 1}`);
}

function deleteCustomColumn(columnIndex) {
  if (!isCustomColumn(columnIndex)) return;
  const removedName = state.headers[columnIndex] || `Column ${columnIndex + 1}`;
  state.headers.splice(columnIndex, 1);
  state.originalHeaders.splice(columnIndex, 1);
  state.rows.forEach((row) => row.splice(columnIndex, 1));
  state.visibleColumns.splice(columnIndex, 1);
  state.columnWidths.splice(columnIndex, 1);
  state.columnOrder = reindexColumnOrder(state.columnOrder, columnIndex);
  state.columnFilters = reindexColumnFilters(state.columnFilters, columnIndex);
  state.duplicateFilters = reindexColumnSet(state.duplicateFilters, columnIndex);
  state.customColumns = reindexColumnSet(state.customColumns, columnIndex);
  state.cellMeta = reindexCellMeta(state.cellMeta, columnIndex);
  state.editedCells = reindexCellKeyMap(state.editedCells, columnIndex);
  state.manualHighlights = reindexCellKeyMap(state.manualHighlights, columnIndex);
  state.undoStack = reindexEditHistory(state.undoStack, columnIndex);
  state.redoStack = reindexEditHistory(state.redoStack, columnIndex);
  invalidateColumnValueCache();
  invalidateColumnProfileCache();
  state.cellVersions = new Map();
  invalidateCellRenderCache();
  if (state.sort.column === columnIndex) state.sort = { column: -1, direction: "none" };
  else if (state.sort.column > columnIndex) state.sort.column -= 1;
  normalizeSelectionAfterColumnDelete(columnIndex);
  if (state.profileColumnIndex === columnIndex) {
    state.detailMode = "cell";
    state.profileColumnIndex = state.selected?.columnIndex ?? -1;
  } else if (state.profileColumnIndex > columnIndex) {
    state.profileColumnIndex -= 1;
  }
  state.issues = analyzeRows(state.headers, state.rows);
  closeColumnFilterMenu();
  updateSearchColumns();
  renderColumnPopover();
  renderColumnOverview();
  updateFileStats();
  seedQueryWorker();
  recomputeView();
  renderDetail();
  els.leftStatus.textContent = `已删除自定义列：${removedName}`;
}
