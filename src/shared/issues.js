const DEFAULT_EMPTY_RATIO_THRESHOLD = 0.6;
const DEFAULT_ISSUE_LONG_FIELD_THRESHOLD = 50000;

function detectDuplicateHeaderIssues(headers) {
  const groups = new Map();
  headers.forEach((header, index) => {
    const name = header == null || header === "" ? `Column ${index + 1}` : String(header);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(index);
  });
  return [...groups.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([columnName, columnIndexes]) => ({
      type: "重复列名",
      rowNumber: 1,
      columnIndex: columnIndexes[0],
      columnIndexes,
      columnName,
      detail: `列名出现 ${columnIndexes.length} 次：${columnIndexes.map((index) => index + 1).join(", ")}`,
      sample: columnName,
    }));
}

function appendRowIssues(issues, headers, row, index, options = {}) {
  if (!row) return;
  const expected = headers.length;
  const rowNumber = index + 2;
  const emptyRatioThreshold = options.emptyRatioThreshold ?? DEFAULT_EMPTY_RATIO_THRESHOLD;
  const longFieldThreshold = options.longFieldThreshold ?? DEFAULT_ISSUE_LONG_FIELD_THRESHOLD;
  if (row.length !== expected) {
    issues.inconsistentRows.push({
      type: "列数不一致",
      rowNumber,
      columnIndex: -1,
      columnName: "",
      detail: `期望 ${expected} 列，实际 ${row.length} 列`,
      sample: row.join(",").slice(0, 300),
    });
  }
  const emptyCount = row.filter((cell) => cell === "").length;
  if (expected > 1 && emptyCount / expected >= emptyRatioThreshold) {
    issues.sparseRows.push({
      type: "空字段比例高",
      rowNumber,
      columnIndex: -1,
      columnName: "",
      detail: `空字段 ${emptyCount}/${expected}`,
      sample: row.join(",").slice(0, 300),
    });
  }
  row.forEach((cell, col) => {
    const text = cell == null ? "" : String(cell);
    if (text.length >= longFieldThreshold) {
      issues.longFields.push({
        type: "超长字段",
        rowNumber,
        columnIndex: col,
        columnName: headers[col] || `Column ${col + 1}`,
        detail: `${text.length} 字符`,
        sample: text.slice(0, 300),
      });
    }
  });
}

function analyzeRows(headers, rows, options = {}) {
  const issues = { inconsistentRows: [], sparseRows: [], longFields: [], duplicateColumns: detectDuplicateHeaderIssues(headers) };
  rows.forEach((row, index) => appendRowIssues(issues, headers, row, index, options));
  return issues;
}
