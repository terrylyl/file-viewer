function escapeSpreadsheetFormula(value) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

function escapeCsv(value) {
  const text = escapeSpreadsheetFormula(value);
  if (/[",\r\n\t;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
