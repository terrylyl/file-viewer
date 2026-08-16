const EXCEL_CELL_META_SCAN_MAX_CELLS = 200000;

let sheetJs = null;
let workbook = null;
let workbookFile = null;
let workbookSheetNames = [];

function getExcelReadOptions() {
  return {
    type: "array",
    cellDates: false,
    dense: true,
    cellStyles: false,
    cellHTML: false,
  };
}

function ensureSheetJs() {
  if (!sheetJs && self.XLSX) sheetJs = self.XLSX;
  if (!sheetJs) throw new Error("内置 SheetJS 未初始化");
  return sheetJs;
}

function normalizeExcelColor(color) {
  if (!color) return "";
  if (typeof color === "string") {
    const value = color.trim().replace(/^#/, "");
    if (/^[0-9a-f]{8}$/i.test(value)) return `#${value.slice(2).toLowerCase()}`;
    if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
    return "";
  }
  if (color.rgb) {
    const value = String(color.rgb).trim().replace(/^#/, "");
    if (/^[0-9a-f]{8}$/i.test(value)) return `#${value.slice(2).toLowerCase()}`;
    if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  }
  return "";
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

function getExcelCell(sheet, rowIndex, columnIndex) {
  if (Array.isArray(sheet)) return sheet[rowIndex]?.[columnIndex] || null;
  if (Array.isArray(sheet["!data"])) return sheet["!data"][rowIndex]?.[columnIndex] || null;
  return sheet[sheetJs.utils.encode_cell({ r: rowIndex, c: columnIndex })] || null;
}

function extractExcelCellMeta(cell) {
  if (!cell) return null;
  const style = typeof cell.s === "object" && cell.s ? cell.s : {};
  const fill = style.fill || style.patternFill || {};
  const font = style.font || {};
  const backgroundColor = normalizeExcelColor(fill.fgColor || fill.bgColor || style.fgColor || style.bgColor);
  const color = normalizeExcelColor(font.color || style.color);
  const html = typeof cell.h === "string" && /<[^>]+>/.test(cell.h) ? cell.h : "";
  const link = normalizeLinkHref(cell.l?.Target || "");
  const meta = {};
  if (backgroundColor && backgroundColor !== "#ffffff") meta.backgroundColor = backgroundColor;
  if (color) meta.color = color;
  if (html) meta.html = html;
  if (link) meta.link = link;
  return Object.keys(meta).length ? meta : null;
}

function collectExcelCellMetaSafely(sheet, rowCount, columnCount, range = null) {
  const cellMeta = new Map();
  if (rowCount * columnCount > EXCEL_CELL_META_SCAN_MAX_CELLS) return cellMeta;
  const startRow = range?.s?.r || 0;
  const startColumn = range?.s?.c || 0;
  for (let row = 1; row < rowCount; row += 1) {
    for (let col = 0; col < columnCount; col += 1) {
      const meta = extractExcelCellMeta(getExcelCell(sheet, startRow + row, startColumn + col));
      if (meta) cellMeta.set(`${row - 1}:${col}`, meta);
    }
  }
  return cellMeta;
}

function buildExcelDatasetFromSheet(sheetName, startedAt) {
  if (!workbook || !sheetJs || !workbookFile) throw new Error("未加载 Excel 工作簿");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`未找到 Sheet：${sheetName}`);
  const valueRange = trimExcelSheetRefToContent(sheet, sheetJs);
  const matrix = trimExcelMatrixToContent(sheetJs.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }));
  const maxColumns = getMatrixColumnCount(matrix);
  const rawHeaders = matrix[0] || [];
  const headers = Array.from({ length: maxColumns }, (_, index) => {
    const value = rawHeaders[index] == null || rawHeaders[index] === "" ? `Column ${index + 1}` : String(rawHeaders[index]);
    return value;
  });
  const rows = matrix.slice(1).map((row) =>
    Array.from({ length: maxColumns }, (_, index) => (row[index] == null ? "" : String(row[index]))),
  );
  return {
    headers,
    rows,
    cellMetaEntries: [...collectExcelCellMetaSafely(sheet, matrix.length, maxColumns, valueRange).entries()],
    issues: analyzeRows(headers, rows),
    file: {
      name: workbookFile.name,
      size: workbookFile.size,
      lastModified: workbookFile.lastModified,
      encoding: "Excel workbook",
      delimiter: sheetName,
      parseMs: Date.now() - startedAt,
      kind: "Excel",
      sheetCount: workbookSheetNames.length,
    },
  };
}

self.onmessage = (event) => {
  const message = event.data || {};
  try {
    if (message.kind === "load-workbook") {
      const startedAt = message.startedAt || Date.now();
      ensureSheetJs();
      workbookFile = message.file || null;
      workbook = sheetJs.read(message.buffer, getExcelReadOptions());
      workbookSheetNames = workbook.SheetNames || [];
      const sheetName = workbookSheetNames[0];
      if (!sheetName) throw new Error("工作簿中没有可读取的 Sheet");
      self.postMessage({
        type: "sheet-complete",
        token: message.token,
        sheetNames: workbookSheetNames,
        activeSheetName: sheetName,
        result: buildExcelDatasetFromSheet(sheetName, startedAt),
      });
      return;
    }
    if (message.kind === "export-xlsx") {
      ensureSheetJs();
      const worksheet = sheetJs.utils.aoa_to_sheet(message.matrix || []);
      const exportWorkbook = sheetJs.utils.book_new();
      sheetJs.utils.book_append_sheet(exportWorkbook, worksheet, "Filtered");
      const buffer = sheetJs.write(exportWorkbook, { bookType: "xlsx", type: "array" });
      self.postMessage({ type: "export-complete", token: message.token, buffer }, [buffer]);
      return;
    }
    if (message.kind === "load-sheet") {
      const sheetName = message.sheetName;
      self.postMessage({
        type: "sheet-complete",
        token: message.token,
        sheetNames: workbookSheetNames,
        activeSheetName: sheetName,
        result: buildExcelDatasetFromSheet(sheetName, message.startedAt || Date.now()),
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      token: message.token,
      stage: sheetJs ? "parse-workbook" : "load-sheetjs",
      message: error && error.message ? error.message : String(error),
    });
  }
};
