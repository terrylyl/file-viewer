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

function createCsvRecordParser(delimiter = ",") {
  let field = "";
  let record = [];
  let started = false;
  let inQuotes = false;
  let pendingQuote = false;
  let pendingBackslash = false;
  let skipLineFeed = false;
  let codeFence = false;
  let backtickRun = 0;
  let structureStack = [];
  let structureInString = false;
  let structureEscaped = false;
  let diagnostics = { unclosedQuotedField: false, unclosedStructuredField: false, unclosedCodeFence: false };

  const emitRecord = (records) => {
    record.push(field);
    records.push(record);
    field = "";
    record = [];
    started = false;
    inQuotes = false;
    pendingQuote = false;
    pendingBackslash = false;
    skipLineFeed = false;
    codeFence = false;
    backtickRun = 0;
    structureStack = [];
    structureInString = false;
    structureEscaped = false;
  };

  const appendStructuredCharacter = (ch) => {
    field += ch;
    started = true;
    if (structureEscaped) {
      structureEscaped = false;
      return;
    }
    if (structureInString) {
      if (ch === "\\") structureEscaped = true;
      else if (ch === '"') structureInString = false;
      return;
    }
    if (ch === '"') {
      structureInString = true;
      return;
    }
    if (ch === "{" || ch === "[") {
      structureStack.push(ch);
      return;
    }
    const open = structureStack.at(-1);
    if ((ch === "}" && open === "{") || (ch === "]" && open === "[")) {
      structureStack.pop();
      return;
    }
    if (ch === "}" || ch === "]") {
      structureStack = [];
      structureInString = false;
      structureEscaped = false;
    }
  };

  const startStructuredField = (ch) => {
    structureStack = [ch];
    structureInString = false;
    structureEscaped = false;
    field += ch;
    started = true;
  };

  const processCharacter = (ch, records) => {
    if (skipLineFeed) {
      skipLineFeed = false;
      if (ch === "\n") return;
    }

    if (pendingBackslash) {
      pendingBackslash = false;
      if (ch === '"' || ch === delimiter || ch === "\\") {
        field += `\\${ch}`;
        started = true;
        return;
      }
      field += "\\";
      started = true;
      processCharacter(ch, records);
      return;
    }

    if (pendingQuote) {
      pendingQuote = false;
      if (structureStack.length) {
        appendStructuredCharacter('"');
        if (ch === '"') return;
        processCharacter(ch, records);
        return;
      }
      if (ch === '"') {
        field += '"';
        started = true;
        return;
      }
      if (ch === delimiter || ch === "\n" || ch === "\r") {
        inQuotes = false;
        processCharacter(ch, records);
        return;
      }
      field += '"';
      started = true;
      processCharacter(ch, records);
      return;
    }

    if (inQuotes) {
      if (ch === '"') {
        pendingQuote = true;
        return;
      }
      if (structureStack.length) {
        appendStructuredCharacter(ch);
        return;
      }
      if (ch === "\\") {
        pendingBackslash = true;
        return;
      }
      if ((ch === "{" || ch === "[") && !field.trim()) {
        startStructuredField(ch);
        return;
      }
      field += ch;
      started = true;
      return;
    }

    if (codeFence) {
      field += ch;
      started = true;
      if (ch === "`") {
        backtickRun += 1;
        if (backtickRun === 3) {
          codeFence = false;
          backtickRun = 0;
        }
      } else {
        backtickRun = 0;
      }
      return;
    }

    if (structureStack.length) {
      appendStructuredCharacter(ch);
      return;
    }

    if (ch === "\\") {
      pendingBackslash = true;
      return;
    }

    if (ch === '"') {
      if (!field.length) inQuotes = true;
      else field += ch;
      started = true;
      return;
    }

    if (ch === "`" && /^`{0,2}$/.test(field.trim())) {
      field += ch;
      started = true;
      backtickRun += 1;
      if (backtickRun === 3) {
        codeFence = true;
        backtickRun = 0;
      }
      return;
    }
    backtickRun = 0;

    if ((ch === "{" || ch === "[") && !field.trim()) {
      startStructuredField(ch);
      return;
    }

    if (ch === delimiter) {
      record.push(field);
      field = "";
      started = true;
      return;
    }

    if (ch === "\n" || ch === "\r") {
      emitRecord(records);
      skipLineFeed = ch === "\r";
      return;
    }

    field += ch;
    started = true;
  };

  return {
    push(text) {
      const records = [];
      for (const ch of String(text == null ? "" : text)) processCharacter(ch, records);
      return records;
    },
    finish() {
      const records = [];
      diagnostics = {
        unclosedQuotedField: inQuotes && !pendingQuote,
        unclosedStructuredField: structureStack.length > 0,
        unclosedCodeFence: codeFence,
      };
      if (pendingBackslash) {
        field += "\\";
        pendingBackslash = false;
      }
      if (pendingQuote) {
        inQuotes = false;
        pendingQuote = false;
      }
      if (started || field.length || record.length) emitRecord(records);
      return records;
    },
    getDiagnostics() {
      return { ...diagnostics };
    },
  };
}

function describeCsvParserDiagnostics(diagnostics) {
  const problems = [];
  if (diagnostics?.unclosedQuotedField) problems.push("CSV 双引号");
  if (diagnostics?.unclosedStructuredField) problems.push("JSON/数组括号");
  if (diagnostics?.unclosedCodeFence) problems.push("Markdown 代码块");
  return problems.length ? `复杂字段未闭合：${problems.join("、")}。后续内容已保留在同一单元格，请检查源 CSV。` : "";
}

function detectCsvDelimiter(text) {
  const candidates = [",", "\t", ";", "|"];
  const sample = String(text == null ? "" : text).slice(0, 256 * 1024);
  let best = ",";
  let bestScore = -Infinity;

  for (const delimiter of candidates) {
    const parser = createCsvRecordParser(delimiter);
    const records = parser.push(sample).filter((record) => record.some((cell) => cell !== "")).slice(0, 20);
    const counts = records.map((record) => Math.max(0, record.length - 1));
    const nonZero = counts.filter((count) => count > 0);
    if (!nonZero.length) continue;
    const average = nonZero.reduce((sum, count) => sum + count, 0) / nonZero.length;
    const variance = nonZero.reduce((sum, count) => sum + Math.abs(count - average), 0) / nonZero.length;
    const consistency = nonZero.length / Math.max(1, records.length);
    const score = average * 4 + consistency * 8 - variance * 3;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }

  return best;
}
