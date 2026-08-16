const COLUMN_PROFILE_TYPE_LABELS = {
  empty: "全空列",
  boolean: "布尔值",
  integer: "整数",
  number: "数值",
  date: "日期",
  text: "文本",
  mixed: "混合类型",
};

function getColumnProfileTypeLabel(type) {
  return COLUMN_PROFILE_TYPE_LABELS[type] || "未知类型";
}

function formatColumnProfileNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatColumnProfileDate(timestamp) {
  if (!Number.isFinite(timestamp)) return "—";
  const iso = new Date(timestamp).toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace("T", " ").replace(".000Z", " UTC");
}

function syncDetailMode() {
  const profileMode = state.detailMode === "profile";
  els.cellDetailView.hidden = profileMode;
  els.columnProfileView.hidden = !profileMode;
  els.cellDetailModeButton.classList.toggle("active", !profileMode);
  els.columnProfileModeButton.classList.toggle("active", profileMode);
  els.cellDetailModeButton.setAttribute("aria-selected", String(!profileMode));
  els.columnProfileModeButton.setAttribute("aria-selected", String(profileMode));
  els.columnProfileModeButton.disabled = state.profileColumnIndex < 0 && !state.selected;
  els.detailPanelTitle.textContent = profileMode ? "列数据画像" : "单元格详情";
  els.detailPanel.setAttribute("aria-label", els.detailPanelTitle.textContent);
  els.restoreDetailButton.textContent = profileMode ? "列画像" : "单元格详情";
}

function showCellDetail() {
  state.detailMode = "cell";
  renderDetail();
}

function openColumnProfile(columnIndex) {
  const index = Number(columnIndex);
  if (!Number.isInteger(index) || index < 0 || index >= state.headers.length) return;
  if (hasPendingCellEditChange()) {
    showToast("请先保存或取消当前单元格编辑");
    return;
  }
  state.cellEdit = null;
  state.profileColumnIndex = index;
  state.detailMode = "profile";
  closeColumnFilterMenu();
  if (els.detailPanel.classList.contains("collapsed")) toggleDetailPanel();
  renderDetail();
}

function computeColumnProfileSync(columnIndex) {
  return buildColumnProfile(state.rows.length, (rowIndex) => state.rows[rowIndex]?.[columnIndex] ?? "");
}

function requestColumnProfile(columnIndex) {
  const columnKey = String(columnIndex);
  if (state.columnProfileCache.has(columnKey) || state.columnProfilePending.has(columnKey)) return;
  if (!canRunLargeExpensiveOperation()) {
    renderColumnProfileError("超大文本文件暂不执行整列画像，以避免扫描和缓存全部长文本");
    return;
  }
  const token = state.columnProfileTokenCounter + 1;
  state.columnProfileTokenCounter = token;
  state.columnProfilePending.add(columnKey);
  state.columnProfileTokens.set(columnKey, token);
  if (canUseQueryWorker()) {
    const worker = isLargeDataMode() ? state.largeDataWorker : state.queryWorker;
    worker.postMessage({
      kind: "column-profile",
      token,
      ...(isLargeDataMode() ? {} : { version: state.queryRowsVersion }),
      columnIndex,
    });
    return;
  }
  window.setTimeout(() => {
    if (state.columnProfileTokens.get(columnKey) !== token) return;
    try {
      state.columnProfileCache.set(columnKey, computeColumnProfileSync(columnIndex));
      state.columnProfilePending.delete(columnKey);
      state.columnProfileTokens.delete(columnKey);
      if (state.detailMode === "profile" && state.profileColumnIndex === columnIndex) renderColumnProfile();
    } catch (error) {
      state.columnProfilePending.delete(columnKey);
      state.columnProfileTokens.delete(columnKey);
      renderColumnProfileError(error.message);
    }
  }, 0);
}

function appendColumnProfileMetric(container, label, value, action = null) {
  const element = action ? document.createElement("button") : document.createElement("div");
  if (action) element.type = "button";
  element.className = `profile-metric${action ? " actionable" : ""}`;
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  element.append(labelElement, valueElement);
  if (action) {
    element.title = action.title || `按${label}筛选`;
    element.addEventListener("click", action.run);
  }
  container.appendChild(element);
}

function appendColumnProfileSection(title) {
  const section = document.createElement("section");
  section.className = "profile-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "profile-metric-grid";
  section.append(heading, grid);
  els.columnProfileContent.appendChild(section);
  return grid;
}

function applyColumnProfileFilter(kind, value = "") {
  const columnIndex = state.profileColumnIndex;
  if (columnIndex < 0) return;
  clearColumnFilter(columnIndex);
  if (kind === "empty") {
    state.columnFilters[String(columnIndex)] = { mode: "all", values: new Set(), condition: { type: "empty" } };
  } else if (kind === "invalid") {
    state.columnFilters[String(columnIndex)] = {
      mode: "all",
      values: new Set(),
      condition: { type: "profile-invalid", value: String(value) },
    };
  } else if (kind === "duplicate") {
    state.duplicateFilters.add(columnIndex);
  } else if (kind === "value") {
    state.columnFilters[String(columnIndex)] = { mode: "include", values: new Set([String(value)]), condition: null };
  }
  recomputeView();
  renderColumnOverview();
  renderColumnProfile();
  showToast(`已按“${state.headers[columnIndex] || `列 ${columnIndex + 1}`}”应用筛选`);
}

function renderColumnProfileError(message) {
  syncDetailMode();
  els.columnProfileContent.innerHTML = "";
  const error = document.createElement("div");
  error.className = "profile-empty-state warning";
  error.textContent = `列画像计算失败：${message}`;
  els.columnProfileContent.appendChild(error);
  els.columnProfileStatus.textContent = "计算失败";
  els.refreshColumnProfileButton.disabled = false;
}

function renderColumnProfile() {
  syncDetailMode();
  const columnIndex = state.profileColumnIndex;
  els.columnProfileContent.innerHTML = "";
  if (columnIndex < 0 || columnIndex >= state.headers.length) {
    els.columnProfileTitle.textContent = "列画像";
    els.columnProfileType.textContent = "";
    els.columnProfileStatus.textContent = "请选择一列";
    els.refreshColumnProfileButton.disabled = true;
    return;
  }
  const columnName = state.headers[columnIndex] || `列 ${columnIndex + 1}`;
  els.columnProfileTitle.textContent = `${columnIndex + 1}. ${columnName}`;
  els.refreshColumnProfileButton.disabled = false;
  const cacheKey = String(columnIndex);
  const profile = state.columnProfileCache.get(cacheKey);
  if (!profile) {
    els.columnProfileType.textContent = "统计中";
    els.columnProfileStatus.textContent = "正在后台分析本列…";
    const loading = document.createElement("div");
    loading.className = "profile-loading";
    loading.innerHTML = "<span></span><span></span><span></span>";
    els.columnProfileContent.appendChild(loading);
    requestColumnProfile(columnIndex);
    return;
  }

  els.columnProfileType.textContent = getColumnProfileTypeLabel(profile.type);
  const overview = appendColumnProfileSection("数据概览");
  appendColumnProfileMetric(overview, "总行数", profile.rowCount.toLocaleString());
  appendColumnProfileMetric(overview, "有效值", profile.nonEmptyCount.toLocaleString());
  appendColumnProfileMetric(overview, "空值", profile.emptyCount.toLocaleString(), profile.emptyCount ? {
    run: () => applyColumnProfileFilter("empty"),
    title: "只看空值行",
  } : null);
  const uniqueLabel = profile.uniqueCount == null
    ? `≥ ${profile.uniqueLowerBound.toLocaleString()}`
    : profile.uniqueCount.toLocaleString();
  appendColumnProfileMetric(overview, "唯一值", uniqueLabel);
  appendColumnProfileMetric(overview, profile.valueCountApproximate ? "重复行（至少）" : "重复行", profile.duplicateRowCount.toLocaleString(), profile.duplicateRowCount ? {
    run: () => applyColumnProfileFilter("duplicate"),
    title: "只看重复值行",
  } : null);
  appendColumnProfileMetric(overview, "类型一致率", `${(profile.consistency * 100).toFixed(1)}%`);
  if (profile.type === "mixed") {
    appendColumnProfileMetric(overview, "主要类型", getColumnProfileTypeLabel(profile.dominantType));
  }
  appendColumnProfileMetric(overview, "异常值", profile.invalidCount.toLocaleString(), profile.invalidCount ? {
    run: () => applyColumnProfileFilter("invalid", profile.dominantType),
    title: "只看无法按主要类型解析的值",
  } : null);

  if ((profile.type === "integer" || profile.type === "number") && profile.numeric) {
    const numeric = appendColumnProfileSection("数值统计");
    appendColumnProfileMetric(numeric, "最小值", formatColumnProfileNumber(profile.numeric.min));
    appendColumnProfileMetric(numeric, "最大值", formatColumnProfileNumber(profile.numeric.max));
    appendColumnProfileMetric(numeric, "平均值", formatColumnProfileNumber(profile.numeric.mean));
    appendColumnProfileMetric(numeric, "零值", profile.numeric.zeroCount.toLocaleString());
    appendColumnProfileMetric(numeric, "负数", profile.numeric.negativeCount.toLocaleString());
  } else if (profile.type === "date" && profile.date) {
    const dates = appendColumnProfileSection("日期范围");
    appendColumnProfileMetric(dates, "最早日期", formatColumnProfileDate(profile.date.earliest));
    appendColumnProfileMetric(dates, "最晚日期", formatColumnProfileDate(profile.date.latest));
  } else if (profile.nonEmptyCount) {
    const text = appendColumnProfileSection("文本特征");
    appendColumnProfileMetric(text, "最短长度", profile.text.minLength.toLocaleString());
    appendColumnProfileMetric(text, "最长长度", profile.text.maxLength.toLocaleString());
    appendColumnProfileMetric(text, "平均长度", formatColumnProfileNumber(profile.text.averageLength));
    appendColumnProfileMetric(text, "首尾空白", profile.text.whitespaceCount.toLocaleString());
    appendColumnProfileMetric(text, "超长内容", profile.text.longTextCount.toLocaleString());
  }

  if (profile.topValues.length) {
    const section = document.createElement("section");
    section.className = "profile-section";
    const heading = document.createElement("h3");
    heading.textContent = profile.valueCountApproximate ? "常见值（基于前 50,000 个唯一值）" : "常见值";
    const list = document.createElement("div");
    list.className = "profile-top-values";
    for (const item of profile.topValues) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = `只看值：${item.value}`;
      const text = document.createElement("span");
      text.textContent = item.value;
      const count = document.createElement("strong");
      count.textContent = item.count.toLocaleString();
      button.append(text, count);
      button.addEventListener("click", () => applyColumnProfileFilter("value", item.value));
      list.appendChild(button);
    }
    section.append(heading, list);
    els.columnProfileContent.appendChild(section);
  }
  els.columnProfileStatus.textContent = `已分析 ${profile.rowCount.toLocaleString()} 行${profile.valueCountApproximate ? " · 高基数列使用有界统计" : ""}`;
}

function refreshColumnProfile() {
  const columnIndex = state.profileColumnIndex;
  if (columnIndex < 0) return;
  invalidateColumnProfileCache(columnIndex);
  renderColumnProfile();
}
