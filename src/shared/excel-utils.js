function isExcelValueEmpty(value) {
  return value == null || String(value).trim() === "";
}

function isExcelCellContentEmpty(cell) {
  if (!cell) return true;
  if (typeof cell !== "object") return isExcelValueEmpty(cell);
  if (!isExcelValueEmpty(cell.v)) return false;
  if (!isExcelValueEmpty(cell.w)) return false;
  if (!isExcelValueEmpty(cell.f)) return false;
  return true;
}

function excelColumnNameToIndex(name) {
  let index = 0;
  for (const char of String(name || "").toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return -1;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function encodeExcelCellAddress(rowIndex, columnIndex) {
  let column = "";
  let value = columnIndex + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return `${column}${rowIndex + 1}`;
}

function decodeExcelCellAddress(address) {
  const match = /^([A-Z]+)(\d+)$/i.exec(String(address || ""));
  if (!match) return null;
  const columnIndex = excelColumnNameToIndex(match[1]);
  const rowIndex = Number.parseInt(match[2], 10) - 1;
  if (columnIndex < 0 || rowIndex < 0) return null;
  return { r: rowIndex, c: columnIndex };
}

function encodeExcelRange(range, XLSX) {
  if (XLSX?.utils?.encode_range) return XLSX.utils.encode_range(range);
  return `${encodeExcelCellAddress(range.s.r, range.s.c)}:${encodeExcelCellAddress(range.e.r, range.e.c)}`;
}

function includeExcelRangeCell(range, rowIndex, columnIndex) {
  if (!range) {
    return { s: { r: rowIndex, c: columnIndex }, e: { r: rowIndex, c: columnIndex } };
  }
  range.s.r = Math.min(range.s.r, rowIndex);
  range.s.c = Math.min(range.s.c, columnIndex);
  range.e.r = Math.max(range.e.r, rowIndex);
  range.e.c = Math.max(range.e.c, columnIndex);
  return range;
}

function getExcelSheetValueRange(sheet, XLSX) {
  let range = null;
  const inspectCell = (cell, rowIndex, columnIndex) => {
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    if (!isExcelCellContentEmpty(cell)) range = includeExcelRangeCell(range, rowIndex, columnIndex);
  };
  const inspectDenseRows = (rows) => {
    for (const rowKey of Object.keys(rows || {})) {
      if (!/^\d+$/.test(rowKey)) continue;
      const rowIndex = Number(rowKey);
      const row = rows[rowKey];
      if (!row || typeof row !== "object") continue;
      for (const columnKey of Object.keys(row)) {
        if (!/^\d+$/.test(columnKey)) continue;
        inspectCell(row[columnKey], rowIndex, Number(columnKey));
      }
    }
  };

  if (Array.isArray(sheet)) inspectDenseRows(sheet);
  if (Array.isArray(sheet?.["!data"])) inspectDenseRows(sheet["!data"]);
  if (sheet && typeof sheet === "object") {
    for (const key of Object.keys(sheet)) {
      if (key[0] === "!") continue;
      const address = /^[A-Z]+\d+$/i.test(key)
        ? XLSX?.utils?.decode_cell
          ? XLSX.utils.decode_cell(key)
          : decodeExcelCellAddress(key)
        : null;
      if (address) inspectCell(sheet[key], address.r, address.c);
    }
  }
  return range;
}

function trimExcelSheetRefToContent(sheet, XLSX) {
  const range = getExcelSheetValueRange(sheet, XLSX);
  if (!range) {
    sheet["!ref"] = "A1:A1";
    return null;
  }
  sheet["!ref"] = encodeExcelRange(range, XLSX);
  return range;
}

function trimExcelMatrixToContent(matrix) {
  let lastRow = -1;
  let lastColumn = -1;
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
    let rowHasContent = false;
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (isExcelValueEmpty(row[columnIndex])) continue;
      rowHasContent = true;
      if (columnIndex > lastColumn) lastColumn = columnIndex;
    }
    if (rowHasContent) lastRow = rowIndex;
  }
  if (lastRow < 0 || lastColumn < 0) return [];
  return matrix.slice(0, lastRow + 1).map((row) =>
    Array.from({ length: lastColumn + 1 }, (_, index) => (row?.[index] == null ? "" : row[index])),
  );
}

function getMatrixColumnCount(matrix) {
  let maxColumns = 0;
  for (const row of matrix) {
    const columnCount = Array.isArray(row) ? row.length : 0;
    if (columnCount > maxColumns) maxColumns = columnCount;
  }
  return maxColumns;
}
