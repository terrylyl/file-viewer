const DEFAULT_PREVIEW_LIMIT = 500;
const DEFAULT_LONG_FIELD_THRESHOLD = 50000;
const EMPTY_RATIO_THRESHOLD = 0.6;

function detectDelimiter(text) {
  return detectCsvDelimiter(text);
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

// 未加引号的 `\` + 分隔符会被解析器当成转义，Windows 路径 `C:\dir\,next` 因此并列。
// 只有当这一行确实比表头少列时才拆回来，`alpha\, beta` 这类列数正常的行不受影响。
function repairBackslashRecord(record, expectedColumns, delimiter) {
  if (!expectedColumns || record.length >= expectedColumns) return record;
  const escaped = `\\${delimiter}`;
  let missing = expectedColumns - record.length;
  const repaired = [];

  for (const cell of record) {
    const value = cell == null ? "" : String(cell);
    if (missing <= 0 || !value.includes(escaped)) {
      repaired.push(value);
      continue;
    }
    const pieces = value.split(escaped);
    const takes = Math.min(missing, pieces.length - 1);
    for (let index = 0; index < takes; index += 1) repaired.push(`${pieces[index]}\\`);
    repaired.push(pieces.slice(takes).join(escaped));
    missing -= takes;
  }

  return repaired.length === expectedColumns ? repaired : record;
}

// 单条记录做宽容重读时最多回看这么多字符。跨行的 JSON、围栏都在这个量级以内，
// 真正不闭合的内容不会因此吞掉整份文件。
const TOLERANT_REPAIR_MAX_CHARS = 1024 * 1024;

// 严格解析之后，只有列数对不上的记录才交给宽容解析处理，且每一步都要验证：
// 记录内的公式/反斜杠修复、以及从该记录起点重读一次——只有结果正好等于表头
// 列数才采纳。合法 CSV 里没有异常记录，这个函数一次都不会动手。
function strictParseEntriesFrom(text, from, delimiter) {
  const parser = createCsvRecordParser(delimiter, { strict: true });
  const rows = [...parser.push(text.slice(from)), ...parser.finish()];
  const starts = parser.getRecordStarts();
  const entries = [];
  rows.forEach((row, index) => {
    if (row.some((cell) => cell !== "")) entries.push({ row, start: from + (starts[index] || 0) });
  });
  return entries;
}

// 修复越过严格记录边界后最多重解析多少次剩余文本。异常行本来就少，
// 这个上限只是防止病态文件把重解析变成 O(n²)。
const TOLERANT_REPAIR_MAX_RESYNC = 64;
// 异常记录往前回看多少条。跨行的 JSON、Markdown 围栏会让**列数正确**的记录
// 也是错的（`1,{` 正好两列，但那个 `{` 还没写完），异常要到后面几行才暴露。
const TOLERANT_REPAIR_MAX_LOOKBACK = 8;

// 这条记录的末字段看起来还没写完吗：括号没配平、以分隔符收尾（跨行 JSON 的
// 续行长这样），或者围栏标记出现了奇数次。
function opensMultilineField(row, delimiter) {
  if (!row.length) return false;
  const last = String(row[row.length - 1] ?? "");
  if (last.endsWith(delimiter) || last === "") return true;
  const joined = row.join(delimiter);
  if ((joined.split("```").length - 1) % 2 === 1) return true;
  let depth = 0;
  for (const ch of joined) {
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return depth > 0;
}

function repairAnomalousRecords(text, delimiter, initialEntries, expectedColumns) {
  if (!expectedColumns) return initialEntries.map((entry) => entry.row);
  const repaired = [];
  const repairedFrom = [];
  let entries = initialEntries;
  let index = 0;
  let resyncBudget = TOLERANT_REPAIR_MAX_RESYNC;

  const emit = (row, fromIndex) => {
    repaired.push(row);
    repairedFrom.push(fromIndex);
  };

  while (index < entries.length) {
    const entry = entries[index];
    if (entry.row.length === expectedColumns) {
      emit(entry.row, index);
      index += 1;
      continue;
    }

    // 先试记录内的修复：公式被逗号切开、反斜杠吞掉了分隔符，都不涉及跨行
    const local = repairBackslashRecord(
      repairFormulaRecord(entry.row, expectedColumns, delimiter),
      expectedColumns,
      delimiter,
    );
    if (local.length === expectedColumns) {
      emit(local, index);
      index += 1;
      continue;
    }

    // 再从这条记录的起点用宽容解析重读一次（未加引号的 JSON、Markdown 围栏
    // 会因此重新合成一个 cell）。列数对不上就丢弃这次尝试，保留严格解析结果。
    // 跨行内容的开头那条记录列数往往是对的，异常要到后面才暴露，所以要回看。
    let from = index;
    let lookback = 0;
    while (
      from > 0
      && lookback < TOLERANT_REPAIR_MAX_LOOKBACK
      && opensMultilineField(entries[from - 1].row, delimiter)
    ) {
      from -= 1;
      lookback += 1;
    }
    const attempt = reparseFirstToleratedRecord(text, entries[from].start, delimiter, TOLERANT_REPAIR_MAX_CHARS, expectedColumns);
    if (attempt && attempt.record.length === expectedColumns && attempt.end > entry.start) {
      while (repairedFrom.length && repairedFrom[repairedFrom.length - 1] >= from) {
        repaired.pop();
        repairedFrom.pop();
      }
      emit(attempt.record, from);
      let next = index + 1;
      while (next < entries.length && entries[next].start < attempt.end) next += 1;
      // 宽容解析读到的终点不一定落在严格记录的边界上——严格解析在畸形行上
      // 可能已经把好几行并成一条。对不齐就从终点重新严格解析，否则后面的行会丢。
      const aligned = next >= entries.length
        ? attempt.end >= text.length
        : entries[next].start === attempt.end;
      if (!aligned && resyncBudget > 0) {
        resyncBudget -= 1;
        entries = strictParseEntriesFrom(text, attempt.end, delimiter);
        repairedFrom.length = 0;
        index = 0;
        continue;
      }
      index = next;
      continue;
    }

    emit(local, index);
    index += 1;
  }

  return repaired;
}

function parseCsvText(text, options = {}) {
  const delimiter = options.delimiter || detectDelimiter(text);
  const previewLimit = options.previewLimit || DEFAULT_PREVIEW_LIMIT;
  const longFieldThreshold = options.longFieldThreshold || DEFAULT_LONG_FIELD_THRESHOLD;
  // 先按严格 RFC4180 解析一遍。合法 CSV 到这里就已经是正确结果，宽容解析
  // 只在后面对"列数对不上"的记录出手，因此不可能把一份本来正确的文件改坏。
  const records = [];
  const strict = Boolean(options.strict);
  const parser = createCsvRecordParser(delimiter, { strict: true });
  const chunkSize = 64 * 1024;
  for (let start = 0; start < text.length; start += chunkSize) {
    const parsedRecords = parser.push(text.slice(start, start + chunkSize));
    for (const parsedRecord of parsedRecords) records.push(parsedRecord);
    if (options.onProgress) options.onProgress(Math.min(0.98, (start + chunkSize) / Math.max(1, text.length)));
  }
  for (const parsedRecord of parser.finish()) records.push(parsedRecord);
  const recordStarts = parser.getRecordStarts();
  const parserDiagnostics = parser.getDiagnostics();
  const parserWarning = describeCsvParserDiagnostics(parserDiagnostics);

  // 文件开头的空行、",,"占位行不能顶替表头，否则列名全变成 Column N、
  // 真表头降级成第一行数据。判定口径与 detectCsvDelimiter 的取样保持一致。
  const nonEmpty = [];
  records.forEach((row, index) => {
    if (row.some((cell) => cell !== "")) nonEmpty.push({ row, start: recordStarts[index] || 0 });
  });
  const nonEmptyRecords = nonEmpty.map((entry) => entry.row);
  // options.headerIndex 来自用户手动指定，优先于自动识别
  const manualHeaderIndex = Number.isFinite(options.headerIndex) && options.headerIndex >= 0
    ? Math.min(options.headerIndex, Math.max(0, nonEmptyRecords.length - 1))
    : -1;
  const headerIndex = manualHeaderIndex >= 0 ? manualHeaderIndex : findCsvHeaderIndex(nonEmptyRecords);
  const rawHeaders = nonEmptyRecords[headerIndex] || [];
  const expectedColumns = rawHeaders.length;
  // 标题行仍然是用户的数据，只是不再占着表头：按原顺序留在表头之前的位置。
  const bodyEntries = headerIndex
    ? [...nonEmpty.slice(0, headerIndex), ...nonEmpty.slice(headerIndex + 1)]
    : nonEmpty.slice(1);
  const bodyRecords = strict
    ? bodyEntries.map((entry) => entry.row)
    : repairAnomalousRecords(text, delimiter, bodyEntries, expectedColumns);
  const recordsForAnalysis = expectedColumns
    ? [rawHeaders, ...bodyRecords]
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
  if (headerIndex > 0 && manualHeaderIndex < 0) {
    issues.inconsistentRows.push(
      buildIssueSummary(
        "表头不在首行",
        1,
        -1,
        "",
        `前 ${headerIndex} 行只有一个单元格，已按标题行处理：表头取自第 ${headerIndex + 1} 行，这些行仍作为数据行保留`,
        nonEmptyRecords[0]?.join(delimiter) || "",
      ),
    );
  }
  // 分隔符判错最典型的表现就是整表只剩一列，而且每行列数都"一致"，
  // 不会触发任何既有告警。这里主动提示一次，别让它静默。
  if (maxColumns <= 1 && recordsForAnalysis.length > 1) {
    const alternative = findCsvDelimiterAlternative(text, delimiter);
    if (alternative) {
      issues.inconsistentRows.push(
        buildIssueSummary(
          "分隔符可能判断有误",
          1,
          -1,
          "",
          `整表只解析出 1 列；改用「${describeCsvDelimiter(alternative.delimiter)}」可切出 ${alternative.columns} 列，请确认源文件的分隔符`,
          recordsForAnalysis[0]?.join(delimiter) || "",
        ),
      );
    }
  }
  if (parserWarning) {
    issues.inconsistentRows.push(
      buildIssueSummary(
        "复杂字段未闭合",
        Math.max(2, recordsForAnalysis.length),
        -1,
        "",
        parserWarning,
        recordsForAnalysis.at(-1)?.join(delimiter) || "",
      ),
    );
  }

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

  // 未双写的引号本身还能兜住，真正的破坏是"某个 `"` 后面恰好跟着分隔符"导致
  // 字段提前收尾。所以要等列数不一致真的出现了才提示，避免对合法文件误报。
  if (parserDiagnostics.undoubledQuote && issues.inconsistentRows.some((issue) => issue.type === "列数不一致")) {
    issues.inconsistentRows.push(
      buildIssueSummary(CSV_UNDOUBLED_QUOTE_ISSUE, 1, -1, "", CSV_UNDOUBLED_QUOTE_DETAIL, ""),
    );
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
  createCsvRecordParser,
  parseCsvText,
  parseJsonlText,
  decodeBuffer,
  // 导出转义和解析必须成对验证：导出的 CSV 要能被同一个解析器原样读回来。
  escapeCsv,
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
        lastModified: message.fileLastModified,
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
      strict: Boolean(message.strict),
      headerIndex: message.headerRow > 0 ? message.headerRow - 1 : -1,
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
      lastModified: message.fileLastModified,
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
