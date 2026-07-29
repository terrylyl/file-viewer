function copySelectedRow() {
  if (!state.selected) return;
  const visibleColumns = getVisibleColumnIndexes();
  const row = state.rows[state.selected.rowIndex];
  copyText(visibleColumns.map((col) => row[col] || "").join("\t"));
}

function copySelectedHeader() {
  if (!state.selected) return;
  copyText(state.headers[state.selected.columnIndex] || "");
}

function setDetailPanelCollapsed(collapsed) {
  els.detailPanel.classList.toggle("collapsed", collapsed);
  els.mainLayout.classList.toggle("detail-collapsed", collapsed);
  els.restoreDetailButton.hidden = !collapsed;
  els.detailResizeHandle.hidden = collapsed;
  els.detailResizeHandle.tabIndex = collapsed ? -1 : 0;
  els.toggleDetailButton.setAttribute("aria-expanded", String(!collapsed));
  els.restoreDetailButton.setAttribute("aria-expanded", String(!collapsed));
  if (!collapsed) renderDetail();
}

function toggleDetailPanel(options = {}) {
  const collapsed = !els.detailPanel.classList.contains("collapsed");
  const update = () => setDetailPanelCollapsed(collapsed);
  const shouldTransition =
    options.animate !== false &&
    window.innerWidth > 980 &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    typeof document.startViewTransition === "function";
  if (shouldTransition) {
    document.startViewTransition(update);
    return;
  }
  update();
}

function setMobileToolsExpanded(expanded) {
  els.toolbar.classList.toggle("mobile-expanded", expanded);
  els.mobileToolsButton.setAttribute("aria-expanded", String(expanded));
  els.mobileToolsButton.textContent = expanded ? "收起工具" : "工具";
}

function toggleMobileTools() {
  setMobileToolsExpanded(!els.toolbar.classList.contains("mobile-expanded"));
}

function openShortcutHelp(options = {}) {
  closeCommandPalette();
  els.shortcutHelpBackdrop.classList.toggle("no-motion", options.animate === false);
  openManagedDialog(els.shortcutHelpBackdrop, els.closeShortcutHelpButton);
}

function closeShortcutHelp() {
  const noMotion = els.shortcutHelpBackdrop.classList.contains("no-motion");
  closeManagedDialog(els.shortcutHelpBackdrop);
  if (noMotion) requestAnimationFrame(() => els.shortcutHelpBackdrop.classList.remove("no-motion"));
}

function getCommandPaletteCommands() {
  const commands = [
    {
      label: "聚焦全表搜索",
      description: "在当前文件中搜索关键词",
      group: "导航",
      run: () => els.searchInput.focus(),
    },
    {
      label: "选择文件",
      description: "打开新的本地表格文件",
      group: "文件",
      run: () => els.chooseFileButton.click(),
    },
    {
      label: "导出当前视图",
      description: "设置格式、拆分数量并导出",
      group: "文件",
      disabled: els.exportMenuButton.disabled,
      run: () => els.exportMenuButton.click(),
    },
    {
      label: "列显示设置",
      description: "选择当前可见列",
      group: "数据",
      disabled: els.columnsButton.disabled,
      run: () => els.columnsButton.click(),
    },
    {
      label: "新增列",
      description: "添加空列、序号列、复制列或常量列",
      group: "数据",
      disabled: els.addColumnButton.disabled,
      run: () => els.addColumnButton.click(),
    },
    {
      label: "拼接列",
      description: "按规则生成新的拼接列",
      group: "数据",
      disabled: els.concatenateColumnButton.disabled,
      run: () => els.concatenateColumnButton.click(),
    },
    {
      label: state.wrapCells ? "关闭单元格全文换行" : "开启单元格全文换行",
      description: "切换表格单元格的完整文本显示",
      group: "视图",
      disabled: !state.rows.length,
      run: () => {
        els.wrapCellsInput.checked = !els.wrapCellsInput.checked;
        els.wrapCellsInput.dispatchEvent(new Event("change", { bubbles: true }));
      },
    },
    {
      label: els.detailPanel.classList.contains("collapsed") ? "展开单元格详情" : "收起单元格详情",
      description: "切换右侧详情面板",
      group: "视图",
      run: () => toggleDetailPanel({ animate: false }),
    },
    {
      label: "清除全部筛选",
      description: "同时清除搜索筛选、列筛选、隐藏行和排序",
      group: "视图",
      disabled: !state.rows.length,
      run: clearAllFilters,
    },
    {
      label: "查看快捷键",
      description: "打开键盘操作帮助",
      group: "帮助",
      run: () => openShortcutHelp({ animate: false }),
    },
  ];

  state.headers.slice(0, 500).forEach((header, columnIndex) => {
    commands.push({
      label: `搜索范围设为：${header}`,
      description: `仅在第 ${columnIndex + 1} 列中搜索`,
      group: "列",
      run: () => {
        els.searchColumnSelect.value = String(columnIndex);
        els.searchInput.focus();
      },
    });
  });
  return commands;
}

function runCommandPaletteItem(command) {
  if (!command || command.disabled) return;
  closeCommandPalette();
  window.setTimeout(command.run, 0);
}

function renderCommandPalette() {
  const query = els.commandPaletteInput.value.trim().toLocaleLowerCase();
  const commands = getCommandPaletteCommands()
    .filter((command) => !query || `${command.label} ${command.description} ${command.group}`.toLocaleLowerCase().includes(query))
    .slice(0, 50);
  state.commandPaletteCommands = commands;
  state.commandPaletteIndex = Math.max(0, Math.min(state.commandPaletteIndex, Math.max(0, commands.length - 1)));
  els.commandPaletteList.innerHTML = "";

  if (!commands.length) {
    const empty = document.createElement("div");
    empty.className = "command-empty";
    empty.textContent = "没有找到匹配的命令";
    els.commandPaletteList.appendChild(empty);
    return;
  }

  commands.forEach((command, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `command-item${index === state.commandPaletteIndex ? " active" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === state.commandPaletteIndex));
    button.disabled = Boolean(command.disabled);
    const copy = document.createElement("span");
    copy.className = "command-item-copy";
    const title = document.createElement("strong");
    title.textContent = command.label;
    const description = document.createElement("span");
    description.textContent = command.description;
    copy.append(title, description);
    const group = document.createElement("span");
    group.className = "command-item-group";
    group.textContent = command.group;
    button.append(copy, group);
    button.addEventListener("click", () => runCommandPaletteItem(command));
    els.commandPaletteList.appendChild(button);
  });
}

function openCommandPalette() {
  closeShortcutHelp();
  closeExportPopover();
  state.commandPaletteIndex = 0;
  els.commandPaletteInput.value = "";
  renderCommandPalette();
  openManagedDialog(els.commandPaletteBackdrop, els.commandPaletteInput);
}

function closeCommandPalette() {
  closeManagedDialog(els.commandPaletteBackdrop);
}

function handleWorkspaceShortcuts(event) {
  const key = event.key.toLocaleLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "k") {
    event.preventDefault();
    if (els.commandPaletteBackdrop.classList.contains("open")) closeCommandPalette();
    else openCommandPalette();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "f" && !els.modalBackdrop.classList.contains("open")) {
    event.preventDefault();
    closeCommandPalette();
    els.searchInput.focus();
    els.searchInput.select();
    return;
  }
  if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableShortcutTarget(event.target)) {
    event.preventDefault();
    openShortcutHelp({ animate: false });
  }
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const debouncedSearch = debounce(() => {
  recomputeView();
  renderDetail();
}, 180);

const debouncedColumnFilterSearch = debounce(() => {
  state.columnFilterMenu.query = els.columnFilterSearchInput.value;
  renderColumnFilterValues();
}, 120);

els.chooseFileButton.addEventListener("click", openFileWithPicker);
els.emptyChooseFileButton.addEventListener("click", openFileWithPicker);
els.emptyClipboardImportButton.addEventListener("click", (event) => openClipboardImportPopover(event.currentTarget));
els.clipboardImportButton.addEventListener("click", (event) => openClipboardImportPopover(event.currentTarget));
els.mobileToolsButton.addEventListener("click", toggleMobileTools);
els.clearActiveFiltersButton.addEventListener("click", clearAllFilters);
els.exportMenuButton.addEventListener("click", (event) => openExportPopover(event.currentTarget));
els.closeExportPopoverButton.addEventListener("click", closeExportPopover);
els.exportFormatSelect.addEventListener("change", updateExportPanel);
els.exportSplitCountInput.addEventListener("input", updateExportPanel);
els.selectionCopyButton.addEventListener("click", copySelection);
els.selectionEditButton.addEventListener("click", beginCellEdit);
els.selectionHighlightButton.addEventListener("click", () => {
  if (applySelectedHighlight("yellow")) {
    showToast("已高亮当前单元格", { actionLabel: "撤销", onAction: undoLastAction });
  }
});
els.selectionOpenButton.addEventListener("click", () => {
  if (state.selected) openModalForCell(state.selected.rowIndex, state.selected.columnIndex);
});
els.selectionExcludeButton.addEventListener("click", excludeSelectedRows);
els.cancelClipboardImportButton.addEventListener("click", closeClipboardImportPopover);
els.confirmClipboardImportButton.addEventListener("click", importClipboardTable);
els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files, null));
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragover");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragover"));
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragover");
  handleFiles(event.dataTransfer.files, null);
});

els.gridViewport.addEventListener("scroll", renderRowsOnly, { passive: true });
els.gridViewport.addEventListener("keydown", handleGridKeyDown);
els.searchInput.addEventListener("input", debouncedSearch);
els.searchColumnSelect.addEventListener("change", recomputeView);
els.sheetSelect.addEventListener("change", () => loadExcelSheet(els.sheetSelect.value));
els.caseSensitiveInput.addEventListener("change", () => {
  recomputeView();
  renderDetail();
  renderModal();
});
els.matchedOnlyInput.addEventListener("change", recomputeView);
els.wrapCellsInput.addEventListener("change", () => {
  state.wrapCells = els.wrapCellsInput.checked;
  els.gridViewport.scrollTop = 0;
  renderGrid();
});
els.clearSearchButton.addEventListener("click", () => {
  els.searchInput.value = "";
  els.matchedOnlyInput.checked = false;
  recomputeView();
});
els.xlsxConvertCsvButton.addEventListener("click", convertSelectedXlsxSheetToCsv);
els.clearAllFiltersButton.addEventListener("click", clearAllFilters);
els.exportCsvButton.addEventListener("click", exportFilteredTable);
els.copyCellButton.addEventListener("click", copySelection);
els.editCellButton.addEventListener("click", beginCellEdit);
els.saveCellEditButton.addEventListener("click", saveCellEdit);
els.cancelCellEditButton.addEventListener("click", cancelCellEdit);
els.undoLastActionButton.addEventListener("click", undoLastAction);
els.redoLastActionButton.addEventListener("click", redoLastAction);
els.highlightYellowOption.addEventListener("click", () => applySelectedHighlight("yellow"));
els.highlightBlueOption.addEventListener("click", () => applySelectedHighlight("blue"));
els.highlightPinkOption.addEventListener("click", () => applySelectedHighlight("pink"));
els.clearHighlightOption.addEventListener("click", () => applySelectedHighlight(""));
els.openModalButton.addEventListener("click", () => {
  if (state.selected) openModalForCell(state.selected.rowIndex, state.selected.columnIndex);
});
els.cellDetailModeButton.addEventListener("click", showCellDetail);
els.columnProfileModeButton.addEventListener("click", () => {
  const columnIndex = state.detailMode === "cell" && state.selected
    ? state.selected.columnIndex
    : state.profileColumnIndex;
  openColumnProfile(columnIndex);
});
els.refreshColumnProfileButton.addEventListener("click", refreshColumnProfile);
els.detailSearchInput.addEventListener("input", () => {
  state.detailVisibleChars = DETAIL_CHUNK;
  renderDetail();
});
els.monoInput.addEventListener("change", renderDetail);
els.loadMoreDetailButton.addEventListener("click", () => {
  state.detailVisibleChars += DETAIL_CHUNK;
  renderDetail();
});
els.closeModalButton.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (event) => {
  if (event.target === els.modalBackdrop && Date.now() < state.modalSuppressBackdropClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.target === els.modalBackdrop) closeModal();
});
els.modalSearchInput.addEventListener("input", () => {
  state.modalVisibleChars = MODAL_CHUNK;
  renderModal();
});
els.modalFormatSelect.addEventListener("change", renderModal);
els.modalMonoInput.addEventListener("change", renderModal);
els.modalSplitHandle.addEventListener("pointerdown", startModalSplitResize);
els.modalSplitHandle.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  nudgeModalSplit(event.key === "ArrowLeft" ? -24 : 24);
});
els.modalResizeHandle.addEventListener("pointerdown", startModalResize);
els.modalResizeHandle.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const widthDelta = event.key === "ArrowLeft" ? -32 : event.key === "ArrowRight" ? 32 : 0;
  const heightDelta = event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0;
  nudgeModalSize(widthDelta, heightDelta);
});
els.detailResizeHandle.addEventListener("pointerdown", startDetailResize);
els.detailResizeHandle.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  nudgeDetailPanelWidth(event.key === "ArrowLeft" ? DETAIL_PANEL_WIDTH_STEP : -DETAIL_PANEL_WIDTH_STEP);
});
els.copyModalButton.addEventListener("click", () => {
  if (!state.modalCell) return;
  copyText(state.rows[state.modalCell.rowIndex]?.[state.modalCell.columnIndex] || "");
});
els.loadMoreModalButton.addEventListener("click", () => {
  state.modalVisibleChars += MODAL_CHUNK;
  renderModal();
});
els.commandPaletteInput.addEventListener("input", () => {
  state.commandPaletteIndex = 0;
  renderCommandPalette();
});
els.commandPaletteInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const length = state.commandPaletteCommands.length;
    if (!length) return;
    state.commandPaletteIndex = (state.commandPaletteIndex + direction + length) % length;
    renderCommandPalette();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    runCommandPaletteItem(state.commandPaletteCommands[state.commandPaletteIndex]);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
  }
});
els.commandPaletteBackdrop.addEventListener("click", (event) => {
  if (event.target === els.commandPaletteBackdrop) closeCommandPalette();
});
els.closeShortcutHelpButton.addEventListener("click", closeShortcutHelp);
els.shortcutHelpBackdrop.addEventListener("click", (event) => {
  if (event.target === els.shortcutHelpBackdrop) closeShortcutHelp();
});

els.columnsButton.addEventListener("click", (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  els.columnsPopover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 310))}px`;
  els.columnsPopover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 430))}px`;
  closeClipboardImportPopover();
  closeAddColumnPopover();
  closeConcatenateColumnPopover();
  closeRowFilterPopover();
  els.columnsPopover.classList.toggle("open");
  els.columnsButton.setAttribute("aria-expanded", String(els.columnsPopover.classList.contains("open")));
  if (els.columnsPopover.classList.contains("open")) setPopoverTransformOrigin(els.columnsPopover, rect);
});
els.addColumnButton.addEventListener("click", (event) => openAddColumnPopover(event.currentTarget));
els.concatenateColumnButton.addEventListener("click", (event) => openConcatenateColumnPopover(event.currentTarget));
els.rowFilterButton.addEventListener("click", (event) => openRowFilterPopover(event.currentTarget));
els.closeRowFilterPopoverButton.addEventListener("click", closeRowFilterPopover);
els.rowFilterModeSelect.addEventListener("change", syncRowFilterDraftControls);
els.rowFilterCountInput.addEventListener("input", syncRowFilterDraftControls);
els.rowFilterStartInput.addEventListener("input", syncRowFilterDraftControls);
els.rowFilterEndInput.addEventListener("input", syncRowFilterDraftControls);
els.clearRowFilterButton.addEventListener("click", clearRowWindow);
els.applyRowFilterButton.addEventListener("click", applyRowFilter);
els.newColumnModeSelect.addEventListener("change", syncNewColumnMode);
els.cancelAddColumnButton.addEventListener("click", closeAddColumnPopover);
els.confirmAddColumnButton.addEventListener("click", () => {
  addDerivedColumn({
    name: els.newColumnNameInput.value,
    mode: els.newColumnModeSelect.value,
    sourceColumnIndex: Number(els.copyColumnSelect.value),
    constantValue: els.constantColumnValueInput.value,
  });
});
els.addConcatenateRowButton.addEventListener("click", () => {
  const item = createDefaultConcatenateItem(0);
  const enteringMotionId = getConcatenateMotionId(item);
  state.concatenateColumnItems.push(item);
  setConcatenateValidation();
  renderConcatenateRows({ enteringMotionId });
});
els.cancelConcatenateColumnButton.addEventListener("click", closeConcatenateColumnPopover);
els.applyConcatenateSchemeButton.addEventListener("click", applyConcatenateScheme);
els.confirmConcatenateColumnButton.addEventListener("click", () => {
  const resolved = resolveConcatenateItems(state.concatenateColumnItems);
  if (resolved.errors.length) {
    setConcatenateValidation(resolved.errors);
    return;
  }
  addConcatenatedColumn({
    name: els.concatenateColumnNameInput.value,
    items: resolved.items,
  });
});
els.newColumnNameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.confirmAddColumnButton.click();
});
els.constantColumnValueInput.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
  event.preventDefault();
  els.confirmAddColumnButton.click();
});
els.showAllColumnsButton.addEventListener("click", () => {
  state.visibleColumns = state.headers.map(() => true);
  renderColumnPopover();
  renderGrid();
});
els.hideAllColumnsButton.addEventListener("click", () => {
  state.visibleColumns = state.headers.map(() => false);
  renderColumnPopover();
  renderGrid();
});
els.filterSortAscButton.addEventListener("click", () => {
  const columnIndex = state.columnFilterMenu.columnIndex;
  if (columnIndex < 0) return;
  state.sort = { column: columnIndex, direction: "asc" };
  recomputeView();
  closeColumnFilterMenu();
});
els.filterSortDescButton.addEventListener("click", () => {
  const columnIndex = state.columnFilterMenu.columnIndex;
  if (columnIndex < 0) return;
  state.sort = { column: columnIndex, direction: "desc" };
  recomputeView();
  closeColumnFilterMenu();
});
els.columnFilterSearchInput.addEventListener("input", debouncedColumnFilterSearch);
els.columnConditionOperatorSelect.addEventListener("change", () => {
  const type = els.columnConditionOperatorSelect.value;
  els.columnConditionValueInput.disabled = !columnFilterConditionNeedsValue(type);
  els.columnConditionValueLabelText.textContent = getColumnFilterConditionValueLabel(type);
  els.columnConditionValueInput.placeholder = getColumnFilterConditionValuePlaceholder(type);
  els.columnConditionHint.textContent = getColumnFilterConditionHint(type);
  if (type === "list-token-count-gte" || type === "distinct-list-token-count-gte") {
    els.columnConditionValueInput.value = els.columnConditionValueInput.value || "2";
  }
  if (type.startsWith("number-")) {
    els.columnConditionValueInput.value = els.columnConditionValueInput.value || "0";
  }
  if (type === "" || type === "non-empty" || type === "duplicate" || els.columnConditionValueInput.value.trim()) {
    updateColumnConditionFilter(state.columnFilterMenu.columnIndex);
  }
});
els.columnConditionValueInput.addEventListener("input", () => {
  const type = els.columnConditionOperatorSelect.value;
  updateColumnConditionFilter(state.columnFilterMenu.columnIndex, {
    keepDraftControls: columnFilterConditionNeedsValue(type) && !els.columnConditionValueInput.value.trim(),
  });
});
els.clearColumnFilterButton.addEventListener("click", clearCurrentColumnFilter);
els.closeColumnFilterButton.addEventListener("click", closeColumnFilterMenu);
els.columnFilterBackdrop.addEventListener("click", closeColumnFilterMenu);
els.selectAllFilterValuesButton.addEventListener("click", () => updateFilterValuesForVisible(true));
els.selectNoFilterValuesButton.addEventListener("click", () => updateFilterValuesForVisible(false));
els.hideFilteredRowsButton.addEventListener("click", hideRowsByCurrentColumnFilter);
els.showHiddenRowsButton.addEventListener("click", showHiddenRows);
els.renameColumnButton.addEventListener("click", () => renameColumn(state.columnFilterMenu.columnIndex, els.renameColumnInput.value));
els.renameColumnInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.renameColumnButton.click();
});
els.restoreColumnNameButton.addEventListener("click", () => restoreColumnName(state.columnFilterMenu.columnIndex));
els.deleteCustomColumnButton.addEventListener("click", () => deleteCustomColumn(state.columnFilterMenu.columnIndex));
els.viewColumnProfileButton.addEventListener("click", () => openColumnProfile(state.columnFilterMenu.columnIndex));
els.contextMenu.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  if (action === "copy-cell") copyText(getSelectedValue());
  if (action === "copy-row") copySelectedRow();
  if (action === "exclude-row") excludeSelectedRow();
  if (action === "copy-header") copySelectedHeader();
  if (action === "view-full" && state.selected) openModalForCell(state.selected.rowIndex, state.selected.columnIndex);
  closeContextMenu();
});
document.addEventListener("pointerdown", handleDocumentPointerDown);
document.addEventListener("click", (event) => {
  if (!eventPathContains(event, els.columnsPopover) && !eventPathContains(event, els.columnsButton)) {
    els.columnsPopover.classList.remove("open");
    els.columnsButton.setAttribute("aria-expanded", "false");
  }
  if (
    !eventPathContains(event, els.clipboardImportPopover) &&
    !eventPathContains(event, els.clipboardImportButton) &&
    !eventPathContains(event, els.emptyClipboardImportButton)
  ) {
    closeClipboardImportPopover();
  }
  if (!eventPathContains(event, els.addColumnPopover) && !eventPathContains(event, els.addColumnButton)) {
    closeAddColumnPopover();
  }
  if (!eventPathContains(event, els.concatenateColumnPopover) && !eventPathContains(event, els.concatenateColumnButton)) {
    closeConcatenateColumnPopover();
  }
  if (!eventPathContains(event, els.columnFilterPopover) && !eventPathHasSelector(event, ".header-filter-button")) {
    closeColumnFilterMenu();
  }
  if (!eventPathContains(event, els.exportPopover) && !eventPathContains(event, els.exportMenuButton)) {
    closeExportPopover();
  }
  if (!eventPathContains(event, els.rowFilterPopover) && !eventPathContains(event, els.rowFilterButton)) {
    closeRowFilterPopover();
  }
  if (!eventPathContains(event, els.contextMenu)) closeContextMenu();
});
document.addEventListener("pointermove", onResizeMove);
document.addEventListener("pointerup", stopResize);
document.addEventListener("pointercancel", stopResize);
document.addEventListener("mouseup", stopSelectionDrag);
document.addEventListener("keydown", handleCopyShortcut);
document.addEventListener("keydown", handleUndoShortcut);
document.addEventListener("keydown", trapManagedDialogFocus);
document.addEventListener("keydown", handleWorkspaceShortcuts);
document.addEventListener("paste", handlePasteIntoCustomColumns);
window.addEventListener("blur", closeContextMenu);
window.addEventListener("blur", stopResize);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMobileToolsExpanded(false);
    closeCommandPalette();
    closeShortcutHelp();
    closeExportPopover();
    closeRowFilterPopover();
    closeContextMenu();
    closeModal();
    els.columnsPopover.classList.remove("open");
    els.columnsButton.setAttribute("aria-expanded", "false");
    closeClipboardImportPopover();
    closeAddColumnPopover();
    closeConcatenateColumnPopover();
    closeColumnFilterMenu();
  }
});
els.toggleDetailButton.addEventListener("click", () => toggleDetailPanel());
els.restoreDetailButton.addEventListener("click", () => toggleDetailPanel());

const narrowViewportQuery = window.matchMedia("(max-width: 980px)");
loadDetailPanelWidth();
if (!els.detailPanel.classList.contains("collapsed")) toggleDetailPanel({ animate: false });
narrowViewportQuery.addEventListener?.("change", (event) => {
  if (event.matches && !els.detailPanel.classList.contains("collapsed")) toggleDetailPanel({ animate: false });
  if (!event.matches) {
    loadDetailPanelWidth();
    if (state.rows.length && els.detailPanel.classList.contains("collapsed")) toggleDetailPanel({ animate: false });
  }
  renderGrid();
});

syncAppDataState();
renderColumnOverview();
renderFilteredRowStats();
renderGrid();
