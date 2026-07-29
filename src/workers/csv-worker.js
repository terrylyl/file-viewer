const DEFAULT_PREVIEW_LIMIT = 500;
const DEFAULT_LONG_FIELD_THRESHOLD = 50000;
const EMPTY_RATIO_THRESHOLD = 0.6;

function normalizeNewline(ch, text, index) {
  if (ch === "\r") {
    return { isNewline: true, nextIndex: text[index + 1] === "\n" ? index + 1 : index };
  }
  return { isNewline: ch === "\n", nextIndex: index };
}

function countDelimiterOutsideQuotes(recordText, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < recordText.length; i += 1) {
    const ch = recordText[i];
    if (ch === '"') {
      if (inQuotes && recordText[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
}

function samplePhysicalRecords(text, limit = 20) {
  const records = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length && records.length < limit; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += ch + text[i + 1];
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
      continue;
    }
    const newline = normalizeNewline(ch, text, i);
    if (!inQuotes && newline.isNewline) {
      records.push(current);
      current = "";
      i = newline.nextIndex;
      continue;
    }
    current += ch;
  }
  if (current.length > 0) records.push(current);
  return records.filter((line) => line.trim().length > 0);
}

function detectDelimiter(text) {
  const candidates = [",", "\t", ";", "|"];
  const sample = samplePhysicalRecords(text.slice(0, Math.min(text.length, 256 * 1024)));
  let best = ",";
  let bestScore = -Infinity;

  for (const delimiter of candidates) {
    const counts = sample.map((line) => countDelimiterOutsideQuotes(line, delimiter));
    const nonZero = counts.filter((count) => count > 0);
    if (nonZero.length === 0) continue;
    const avg = nonZero.reduce((sum, count) => sum + count, 0) / nonZero.length;
    const variance =
      nonZero.reduce((sum, count) => sum + Math.abs(count - avg), 0) / Math.max(1, nonZero.length);
    const consistency = nonZero.length / Math.max(1, sample.length);
    const score = avg * 4 + consistency * 8 - variance * 3;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }

  return best;
}

function normalizeHeaders(rawHeaders, columnCount) {
  const used = new Map();
  const headers = [];
  for (let i = 0; i < columnCount; i += 1) {
    const raw = rawHeaders[i] == null || rawHeaders[i] === "" ? `Column ${i + 1}` : String(rawHeaders[i]);
    const seen = used.get(raw) || 0;
    used.set(raw, seen + 1);
    headers.push(seen === 0 ? raw : `${raw} (${seen + 1})`);
  }
  return headers;
}

function buildIssueSummary(type, rowNumber, columnIndex, columnName, detail, sample) {
  return {
    type,
    rowNumber,
    columnIndex,
    columnName,
    detail,
    sample: sample == null ? "" : String(sample).slice(0, 300),
  };
}

function detectDuplicateColumns(rawHeaders) {
  const groups = new Map();
  rawHeaders.forEach((header, index) => {
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

function getMaxRecordColumns(records, minimumColumns = 0) {
  let maxColumns = minimumColumns;
  for (const row of records) {
    if (row.length > maxColumns) maxColumns = row.length;
  }
  return maxColumns;
}

function getFormulaNestingDepth(value) {
  const text = String(value == null ? "" : value);
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function repairFormulaRecord(record, expectedColumns, delimiter) {
  if (!expectedColumns || record.length <= expectedColumns) return record;
  const repaired = [];
  let changed = false;

  for (let index = 0; index < record.length; index += 1) {
    const remainingOutput = expectedColumns - repaired.length;
    const remainingFields = record.length - index;
    if (remainingFields === remainingOutput) {
      repaired.push(...record.slice(index));
      break;
    }

    const startIndex = index;
    let value = record[index];
    if (String(value == null ? "" : value).trimStart().startsWith("=")) {
      let depth = getFormulaNestingDepth(value);
      while (
        depth > 0 &&
        index + 1 < record.length &&
        record.length - (index + 2) >= remainingOutput - 1
      ) {
        index += 1;
        value += delimiter + record[index];
        depth = getFormulaNestingDepth(value);
      }
      if (depth === 0 && index > startIndex) {
        repaired.push(value);
        changed = true;
        continue;
      }
      index = startIndex;
    }

    repaired.push(record[index]);
  }

  return changed && repaired.length === expectedColumns ? repaired : record;
}

function parseCsvText(text, options = {}) {
  const delimiter = options.delimiter || detectDelimiter(text);
  const previewLimit = options.previewLimit || DEFAULT_PREVIEW_LIMIT;
  const longFieldThreshold = options.longFieldThreshold || DEFAULT_LONG_FIELD_THRESHOLD;
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let started = false;
  let lastProgressAt = 0;
  const progressEvery = Math.max(1024 * 256, Math.floor(text.length / 100));

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      started = true;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      record.push(field);
      field = "";
      started = true;
      continue;
    }

    const newline = normalizeNewline(ch, text, i);
    if (!inQuotes && newline.isNewline) {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      started = false;
      i = newline.nextIndex;
      continue;
    }

    field += ch;
    started = true;

    if (options.onProgress && i - lastProgressAt >= progressEvery) {
      lastProgressAt = i;
      options.onProgress(Math.min(0.98, i / Math.max(1, text.length)));
    }
  }

  if (started || field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmptyRecords = records.filter((row, index) => {
    if (index === 0) return true;
    return row.some((cell) => cell !== "");
  });
  const rawHeaders = nonEmptyRecords[0] || [];
  const expectedColumns = rawHeaders.length;
  const recordsForAnalysis = expectedColumns
    ? [rawHeaders, ...nonEmptyRecords.slice(1).map((row) => repairFormulaRecord(row, expectedColumns, delimiter))]
    : nonEmptyRecords;
  const maxColumns = getMaxRecordColumns(recordsForAnalysis, expectedColumns);
  const headers = normalizeHeaders(rawHeaders, maxColumns);
  const rows = [];
  const issues = {
    inconsistentRows: [],
    sparseRows: [],
    longFields: [],
    duplicateColumns: detectDuplicateColumns(rawHeaders),
  };

  for (let i = 1; i < recordsForAnalysis.length; i += 1) {
    const rawRow = recordsForAnalysis[i];
    const rowNumber = i + 1;
    if (expectedColumns > 0 && rawRow.length !== expectedColumns) {
      issues.inconsistentRows.push(
        buildIssueSummary(
          "列数不一致",
          rowNumber,
          -1,
          "",
          `期望 ${expectedColumns} 列，实际 ${rawRow.length} 列`,
          rawRow.join(delimiter),
        ),
      );
    }

    const emptyCount = rawRow.filter((cell) => cell === "").length + Math.max(0, maxColumns - rawRow.length);
    if (maxColumns > 1 && emptyCount / maxColumns >= EMPTY_RATIO_THRESHOLD) {
      issues.sparseRows.push(
        buildIssueSummary(
          "空字段比例高",
          rowNumber,
          -1,
          "",
          `空字段 ${emptyCount}/${maxColumns}`,
          rawRow.join(delimiter),
        ),
      );
    }

    for (let col = 0; col < rawRow.length; col += 1) {
      const value = rawRow[col] == null ? "" : String(rawRow[col]);
      if (value.length >= longFieldThreshold) {
        issues.longFields.push(
          buildIssueSummary(
            "超长字段",
            rowNumber,
            col,
            headers[col] || `Column ${col + 1}`,
            `${value.length} 字符`,
            value,
          ),
        );
      }
    }

    const padded = Array.from({ length: maxColumns }, (_, col) => rawRow[col] == null ? "" : String(rawRow[col]));
    rows.push(padded);
  }

  return {
    headers,
    rows,
    issues,
    meta: {
      rowCount: rows.length,
      columnCount: headers.length,
      delimiter,
      previewLimit,
      longFieldThreshold,
    },
  };
}

function stringifyJsonlCellValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function parseJsonlText(text, options = {}) {
  const longFieldThreshold = options.longFieldThreshold || DEFAULT_LONG_FIELD_THRESHOLD;
  const lines = String(text == null ? "" : text).split(/\r\n|\r|\n/);
  const records = [];
  const keyOrder = [];
  const keySet = new Set();

  lines.forEach((line, index) => {
    const sourceLineNumber = index + 1;
    if (!line.trim()) return;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`第 ${sourceLineNumber} 行 JSON 解析失败：${error.message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`第 ${sourceLineNumber} 行不是 JSON object`);
    }
    const keys = Object.keys(parsed);
    for (const key of keys) {
      if (!keySet.has(key)) {
        keySet.add(key);
        keyOrder.push(key);
      }
    }
    records.push({ sourceLineNumber, value: parsed });
    if (options.onProgress && records.length % 1000 === 0) {
      options.onProgress(Math.min(0.98, sourceLineNumber / Math.max(1, lines.length)));
    }
  });

  const headers = normalizeHeaders(keyOrder, keyOrder.length);
  const rows = [];
  const issues = {
    inconsistentRows: [],
    sparseRows: [],
    longFields: [],
    duplicateColumns: [],
  };

  for (const record of records) {
    const row = keyOrder.map((key) => stringifyJsonlCellValue(record.value[key]));
    rows.push(row);
    const emptyCount = row.filter((cell) => cell === "").length;
    if (headers.length > 1 && emptyCount / headers.length >= EMPTY_RATIO_THRESHOLD) {
      issues.sparseRows.push(
        buildIssueSummary(
          "空字段比例高",
          record.sourceLineNumber,
          -1,
          "",
          `空字段 ${emptyCount}/${headers.length}`,
          JSON.stringify(record.value),
        ),
      );
    }
    row.forEach((value, columnIndex) => {
      if (value.length >= longFieldThreshold) {
        issues.longFields.push(
          buildIssueSummary(
            "超长字段",
            record.sourceLineNumber,
            columnIndex,
            headers[columnIndex] || `Column ${columnIndex + 1}`,
            `${value.length} 字符`,
            value,
          ),
        );
      }
    });
  }

  return {
    headers,
    rows,
    issues,
    meta: {
      rowCount: rows.length,
      columnCount: headers.length,
      delimiter: "JSON Lines",
      longFieldThreshold,
    },
  };
}

function decodeBuffer(buffer, encodingPreference = "auto") {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (encodingPreference !== "auto") {
    return {
      text: new TextDecoder(encodingPreference).decode(bytes),
      encoding: encodingPreference.toUpperCase(),
    };
  }

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "UTF-8",
    };
  } catch (error) {
    const labels = ["gb18030", "gbk"];
    for (const label of labels) {
      try {
        return {
          text: new TextDecoder(label).decode(bytes),
          encoding: "GB18030/GBK",
        };
      } catch (innerError) {
        continue;
      }
    }
    return {
      text: new TextDecoder("utf-8").decode(bytes),
      encoding: "UTF-8 (replacement)",
    };
  }
}

self.__CSV_CORE__ = {
  detectDelimiter,
  parseCsvText,
  parseJsonlText,
  decodeBuffer,
};

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.kind !== "parse-csv" && message.kind !== "parse-jsonl") return;

  const startedAt = Date.now();
  try {
    self.postMessage({ type: "progress", stage: "解码文件", progress: 0.04 });
    const decoded = decodeBuffer(message.buffer, message.encoding || "auto");
    if (message.kind === "parse-jsonl") {
      self.postMessage({ type: "progress", stage: "解析 JSONL", progress: 0.12 });
      const result = parseJsonlText(decoded.text, {
        longFieldThreshold: message.longFieldThreshold || DEFAULT_LONG_FIELD_THRESHOLD,
        onProgress(progress) {
          self.postMessage({
            type: "progress",
            stage: "解析 JSONL",
            progress: 0.12 + progress * 0.84,
          });
        },
      });
      result.file = {
        name: message.fileName,
        size: message.fileSize,
        encoding: decoded.encoding,
        delimiter: "JSON Lines",
        parseMs: Date.now() - startedAt,
        kind: "JSONL",
      };
      self.postMessage({ type: "complete", result });
      return;
    }

    self.postMessage({ type: "progress", stage: "识别分隔符", progress: 0.1 });
    const delimiter = message.delimiter || detectDelimiter(decoded.text);
    const result = parseCsvText(decoded.text, {
      delimiter,
      previewLimit: message.previewLimit || DEFAULT_PREVIEW_LIMIT,
      longFieldThreshold: message.longFieldThreshold || DEFAULT_LONG_FIELD_THRESHOLD,
      onProgress(progress) {
        self.postMessage({
          type: "progress",
          stage: "解析 CSV",
          progress: 0.1 + progress * 0.86,
        });
      },
    });
    result.file = {
      name: message.fileName,
      size: message.fileSize,
      encoding: decoded.encoding,
      delimiter,
      parseMs: Date.now() - startedAt,
      kind: "CSV",
    };
    self.postMessage({ type: "complete", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error && error.message ? error.message : String(error),
    });
  }
};
