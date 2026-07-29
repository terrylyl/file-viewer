function normalizeForSearch(value, caseSensitive) {
  const text = value == null ? "" : String(value);
  return caseSensitive ? text : text.toLocaleLowerCase();
}

function compareCells(a, b) {
  const left = a == null ? "" : String(a);
  const right = b == null ? "" : String(b);
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (left.trim() !== "" && right.trim() !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeColumnFilterCondition(condition) {
  if (!condition || typeof condition !== "object") return null;
  const type = String(condition.type || "");
  if (type === "empty") return { type };
  if (type === "non-empty") return { type };
  if (type === "profile-invalid") {
    const value = String(condition.value || "");
    return ["boolean", "integer", "number", "date", "text"].includes(value) ? { type, value } : null;
  }
  if (type === "contains" || type === "not-contains" || type === "regex") {
    const value = String(condition.value ?? "").trim();
    return value ? { type, value } : null;
  }
  if (type === "list-token-count-gte" || type === "distinct-list-token-count-gte") {
    const rawValue = condition.value ?? condition.min;
    if (String(rawValue ?? "").trim() === "") return null;
    const count = Number(rawValue);
    return Number.isFinite(count) && count >= 0 ? { type, value: String(Math.floor(count)) } : null;
  }
  if (["number-gt", "number-gte", "number-lt", "number-lte", "number-eq"].includes(type)) {
    const rawValue = String(condition.value ?? "").trim();
    if (!rawValue) return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? { type, value: rawValue } : null;
  }
  return null;
}

function tokenizeListCellValue(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return [];
  const inner = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
  return inner
    .split(/[,\uFF0C;；|/\r\n]+/)
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function normalizeForConditionText(value) {
  return String(value == null ? "" : value).toLocaleLowerCase();
}

function compareNumberCondition(cellValue, condition) {
  const left = Number(String(cellValue == null ? "" : cellValue).trim());
  const right = Number(condition.value);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (condition.type === "number-gt") return left > right;
  if (condition.type === "number-gte") return left >= right;
  if (condition.type === "number-lt") return left < right;
  if (condition.type === "number-lte") return left <= right;
  if (condition.type === "number-eq") return left === right;
  return true;
}

function evaluateColumnFilterCondition(value, condition) {
  const normalized = normalizeColumnFilterCondition(condition);
  if (!normalized) return true;
  const text = String(value == null ? "" : value);
  if (normalized.type === "empty") return text.trim() === "";
  if (normalized.type === "non-empty") return text.trim() !== "";
  if (normalized.type === "profile-invalid") {
    return text.trim() !== "" && !columnProfileValueMatchesType(text, normalized.value);
  }
  if (normalized.type === "contains") {
    return normalizeForConditionText(text).includes(normalizeForConditionText(normalized.value));
  }
  if (normalized.type === "not-contains") {
    return !normalizeForConditionText(text).includes(normalizeForConditionText(normalized.value));
  }
  if (normalized.type === "regex") {
    try {
      return new RegExp(normalized.value).test(text);
    } catch {
      return false;
    }
  }
  if (normalized.type === "list-token-count-gte" || normalized.type === "distinct-list-token-count-gte") {
    const tokens = tokenizeListCellValue(value);
    const count = normalized.type === "distinct-list-token-count-gte" ? new Set(tokens).size : tokens.length;
    return count >= Number(normalized.value);
  }
  if (normalized.type.startsWith("number-")) {
    return compareNumberCondition(value, normalized);
  }
  return true;
}

function columnFilterAllowsValue(filter, value) {
  if (!filter) return true;
  if (filter.mode === "all") return true;
  if (filter.allowedValues) return filter.allowedValues.has(value);
  const values = filter.valueSet || new Set(filter.values || []);
  if (filter.mode === "exclude") return !values.has(value);
  return values.has(value);
}

function rowPassesColumnFilters(row, activeColumnFilters = []) {
  for (const entry of activeColumnFilters) {
    const columnIndex = Number(entry.columnIndex);
    const filter = entry.filter || entry;
    const value = row[columnIndex] == null ? "" : String(row[columnIndex]);
    if (!columnFilterAllowsValue(filter, value)) return false;
    if (!evaluateColumnFilterCondition(value, filter.condition)) return false;
  }
  return true;
}

function normalizeRowWindow(rowWindow) {
  if (!rowWindow || typeof rowWindow !== "object") return { mode: "all" };
  if (rowWindow.mode === "first") {
    const count = Math.floor(Number(rowWindow.count));
    return Number.isFinite(count) && count > 0 ? { mode: "first", count } : { mode: "all" };
  }
  if (rowWindow.mode === "range") {
    const start = Math.floor(Number(rowWindow.start));
    const end = Math.floor(Number(rowWindow.end));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return { mode: "all" };
    return { mode: "range", start, end };
  }
  return { mode: "all" };
}

function applyRowWindow(rowIndexes, rowWindow) {
  const normalized = normalizeRowWindow(rowWindow);
  if (normalized.mode === "first") return rowIndexes.slice(0, normalized.count);
  if (normalized.mode === "range") return rowIndexes.slice(normalized.start - 1, normalized.end);
  return rowIndexes;
}
