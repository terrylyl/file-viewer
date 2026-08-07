const LARGE_CHUNK_SIZE = 1000;
const ISSUE_SAMPLE_LIMIT = 1000;
const chunkCache = new Map();
let storageDirectory = null;
let chunkCount = 0;
let rowCount = 0;
let headers = [];
let rawHeaders = [];
let dataKind = "CSV";
let delimiter = ",";
let duplicateValueCache = new Map();
let lastViewIndices = new Uint32Array();
let operationQueue = Promise.resolve();

function normalizeHeaders(raw, columnCount) {
  const used = new Map();
  return Array.from({ length: columnCount }, (_, index) => {
    const source = raw[index] == null || raw[index] === "" ? `Column ${index + 1}` : String(raw[index]);
    const seen = used.get(source) || 0;
    used.set(source, seen + 1);
    return seen ? `${source} (${seen + 1})` : source;
  });
}

function chooseEncoding(bytes, requested) {
  if (requested && requested !== "auto") return { label: requested, name: requested.toUpperCase() };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { label: "utf-8", name: "UTF-8" };
  } catch (error) {
    try {
      new TextDecoder("gb18030").decode(bytes);
      return { label: "gb18030", name: "GB18030/GBK" };
    } catch (innerError) {
      return { label: "utf-8", name: "UTF-8 (replacement)" };
    }
  }
}

function createIssues() {
  return { inconsistentRows: [], sparseRows: [], longFields: [], duplicateColumns: [] };
}

function addIssue(issues, key, issue) {
  if (issues[key].length < ISSUE_SAMPLE_LIMIT) issues[key].push(issue);
}

function buildIssue(type, rowNumber, columnIndex, columnName, detail, sample) {
  return { type, rowNumber, columnIndex, columnName, detail, sample: String(sample ?? "").slice(0, 300) };
}

async function openStorage(name) {
  if (!navigator.storage?.getDirectory) throw new Error("当前浏览器不支持 OPFS 大文件存储；请使用最新版 Chrome 或 Edge。");
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(name, { recursive: true }).catch(() => {});
  storageDirectory = await root.getDirectoryHandle(name, { create: true });
  chunkCache.clear();
  chunkCount = 0;
  rowCount = 0;
}

async function writeChunk(index, rows) {
  const file = await storageDirectory.getFileHandle(`chunk-${index}.json`, { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(rows));
  await writable.close();
  chunkCache.set(index, rows);
  while (chunkCache.size > 6) chunkCache.delete(chunkCache.keys().next().value);
}

async function readChunk(index) {
  if (chunkCache.has(index)) {
    const cached = chunkCache.get(index);
    chunkCache.delete(index);
    chunkCache.set(index, cached);
    return cached;
  }
  const fileHandle = await storageDirectory.getFileHandle(`chunk-${index}.json`);
  const file = await fileHandle.getFile();
  const rows = JSON.parse(await file.text());
  chunkCache.set(index, rows);
  while (chunkCache.size > 6) chunkCache.delete(chunkCache.keys().next().value);
  return rows;
}

function toRow(row) {
  return Array.from({ length: headers.length }, (_, index) => row[index] == null ? "" : String(row[index]));
}

function stringifyJsonlValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch (error) { return String(value); }
}

async function parseCsvFile(file, options) {
  const sample = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const encoding = chooseEncoding(sample, options.encoding);
  delimiter = options.delimiter || detectCsvDelimiter(new TextDecoder(encoding.label).decode(sample));
  rawHeaders = [];
  headers = [];
  dataKind = "CSV";
  const issues = createIssues();
  let currentRows = [];
  let processedBytes = 0;

  const appendRecord = async (source) => {
    if (!rawHeaders.length) {
      rawHeaders = source;
      headers = normalizeHeaders(rawHeaders, rawHeaders.length);
      const groups = new Map();
      rawHeaders.forEach((value, index) => {
        const key = value == null || value === "" ? `Column ${index + 1}` : String(value);
        groups.set(key, [...(groups.get(key) || []), index]);
      });
      issues.duplicateColumns = [...groups.entries()].filter(([, indexes]) => indexes.length > 1).map(([columnName, columnIndexes]) => (
        buildIssue("重复列名", 1, columnIndexes[0], columnName, `列名出现 ${columnIndexes.length} 次：${columnIndexes.map((index) => index + 1).join(", ")}`, columnName)
      ));
      return;
    }
    if (!source.some((value) => value !== "")) return;
    const expected = rawHeaders.length;
    if (source.length > headers.length) headers = normalizeHeaders(rawHeaders, source.length);
    const rowNumber = rowCount + 2;
    if (source.length !== expected) addIssue(issues, "inconsistentRows", buildIssue("列数不一致", rowNumber, -1, "", `期望 ${expected} 列，实际 ${source.length} 列`, source.join(delimiter)));
    const emptyCount = source.filter((value) => value === "").length + Math.max(0, headers.length - source.length);
    if (headers.length > 1 && emptyCount / headers.length >= 0.6) addIssue(issues, "sparseRows", buildIssue("空字段比例高", rowNumber, -1, "", `空字段 ${emptyCount}/${headers.length}`, source.join(delimiter)));
    source.forEach((value, columnIndex) => {
      if (String(value).length >= 50000) addIssue(issues, "longFields", buildIssue("超长字段", rowNumber, columnIndex, headers[columnIndex] || `Column ${columnIndex + 1}`, `${String(value).length} 字符`, value));
    });
    currentRows.push(source.map((value) => String(value ?? "")));
    rowCount += 1;
    if (currentRows.length >= LARGE_CHUNK_SIZE) {
      await writeChunk(chunkCount, currentRows);
      chunkCount += 1;
      currentRows = [];
    }
  };

  const parser = createCsvRecordParser(delimiter);
  const reader = file.stream().getReader();
  const decoder = new TextDecoder(encoding.label);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    processedBytes += value.byteLength;
    const parsedRecords = parser.push(decoder.decode(value, { stream: true }));
    for (const parsedRecord of parsedRecords) await appendRecord(parsedRecord);
    self.postMessage({ type: "progress", progress: Math.min(0.94, processedBytes / Math.max(1, file.size) * 0.94), stage: `流式解析 CSV · ${rowCount.toLocaleString()} 行` });
  }
  for (const parsedRecord of parser.push(decoder.decode())) await appendRecord(parsedRecord);
  for (const parsedRecord of parser.finish()) await appendRecord(parsedRecord);
  const parserWarning = describeCsvParserDiagnostics(parser.getDiagnostics());
  if (parserWarning) {
    addIssue(issues, "inconsistentRows", buildIssue(
      "复杂字段未闭合",
      rowCount + 1,
      -1,
      "",
      parserWarning,
      "请检查源 CSV 的引号、JSON/数组括号或 Markdown 代码块",
    ));
  }
  if (currentRows.length) { await writeChunk(chunkCount, currentRows); chunkCount += 1; }
  return { issues, encoding: encoding.name };
}

async function parseJsonlFile(file, options) {
  const sample = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const encoding = chooseEncoding(sample, options.encoding);
  rawHeaders = [];
  headers = [];
  dataKind = "JSONL";
  delimiter = "JSON Lines";
  const issues = createIssues();
  const keys = new Map();
  let currentRows = [];
  let carry = "";
  let lineNumber = 0;
  let processedBytes = 0;
  const appendLine = async (line) => {
    lineNumber += 1;
    if (!line.trim()) return;
    let value;
    try { value = JSON.parse(line); } catch (error) { throw new Error(`第 ${lineNumber} 行 JSON 解析失败：${error.message}`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`第 ${lineNumber} 行不是 JSON object`);
    Object.keys(value).forEach((key) => {
      if (!keys.has(key)) { keys.set(key, keys.size); rawHeaders.push(key); headers = normalizeHeaders(rawHeaders, rawHeaders.length); }
    });
    const row = Array.from({ length: keys.size }, () => "");
    Object.entries(value).forEach(([key, cell]) => { row[keys.get(key)] = stringifyJsonlValue(cell); });
    const emptyCount = row.filter((cell) => cell === "").length;
    if (headers.length > 1 && emptyCount / headers.length >= 0.6) addIssue(issues, "sparseRows", buildIssue("空字段比例高", lineNumber, -1, "", `空字段 ${emptyCount}/${headers.length}`, line));
    row.forEach((cell, columnIndex) => {
      if (cell.length >= 50000) addIssue(issues, "longFields", buildIssue("超长字段", lineNumber, columnIndex, headers[columnIndex] || `Column ${columnIndex + 1}`, `${cell.length} 字符`, cell));
    });
    currentRows.push(row); rowCount += 1;
    if (currentRows.length >= LARGE_CHUNK_SIZE) { await writeChunk(chunkCount, currentRows); chunkCount += 1; currentRows = []; }
  };
  const reader = file.stream().getReader();
  const decoder = new TextDecoder(encoding.label);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    processedBytes += value.byteLength;
    const lines = (carry + decoder.decode(value, { stream: true })).split(/\r\n|\r|\n/);
    carry = lines.pop() || "";
    for (const line of lines) await appendLine(line);
    self.postMessage({ type: "progress", progress: Math.min(0.94, processedBytes / Math.max(1, file.size) * 0.94), stage: `流式解析 JSONL · ${rowCount.toLocaleString()} 行` });
  }
  carry += decoder.decode();
  if (carry) await appendLine(carry);
  if (currentRows.length) { await writeChunk(chunkCount, currentRows); chunkCount += 1; }
  return { issues, encoding: encoding.name };
}

async function forEachRow(callback) {
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const rows = await readChunk(chunkIndex);
    const start = chunkIndex * LARGE_CHUNK_SIZE;
    for (let offset = 0; offset < rows.length; offset += 1) await callback(rows[offset], start + offset, rows, chunkIndex);
  }
}

function rowMatches(row, request, needle) {
  const selectedColumn = Number(request.selectedColumn);
  if (selectedColumn >= 0) return normalizeForSearch(row[selectedColumn] || "", request.caseSensitive).includes(needle);
  return row.some((cell) => normalizeForSearch(cell || "", request.caseSensitive).includes(needle));
}

async function getDuplicateValues(columnIndex) {
  if (duplicateValueCache.has(columnIndex)) return duplicateValueCache.get(columnIndex);
  const counts = new Map();
  await forEachRow((row) => { const value = String(row[columnIndex] ?? ""); if (value.trim()) counts.set(value, (counts.get(value) || 0) + 1); });
  const values = new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
  duplicateValueCache.set(columnIndex, values);
  return values;
}

async function runQuery(request) {
  const needle = request.query ? normalizeForSearch(String(request.query), request.caseSensitive) : "";
  const hiddenRows = new Set(request.hiddenRows || []);
  const filters = (request.filters || []).map((filter) => ({ ...filter, valueSet: new Set(filter.values || []) }));
  const duplicateFilters = [];
  for (const columnIndex of new Set(request.duplicateColumns || [])) duplicateFilters.push({ columnIndex: Number(columnIndex), values: await getDuplicateValues(Number(columnIndex)) });
  const view = [];
  const matches = [];
  await forEachRow((row, index) => {
    if (hiddenRows.has(index) || !rowPassesColumnFilters(row, filters)) return;
    if (duplicateFilters.some((filter) => !filter.values.has(String(row[filter.columnIndex] ?? "")))) return;
    const hit = needle ? rowMatches(row, request, needle) : false;
    if (hit) matches.push(index);
    if (!needle || !request.matchedOnly || hit) view.push(index);
  });
  if (request.sort?.column >= 0 && request.sort?.direction !== "none") {
    const values = new Map();
    await forEachRow((row, index) => { values.set(index, row[request.sort.column] ?? ""); });
    const direction = request.sort.direction === "asc" ? 1 : -1;
    view.sort((a, b) => compareCells(values.get(a), values.get(b)) * direction);
  }
  const windowed = applyRowWindow(view, request.rowWindow);
  lastViewIndices = Uint32Array.from(windowed);
  return { viewIndices: lastViewIndices, matchedRows: Uint32Array.from(matches) };
}

async function getRows(indices) {
  const grouped = new Map();
  for (const index of indices || []) {
    if (!Number.isInteger(index) || index < 0 || index >= rowCount) continue;
    const chunkIndex = Math.floor(index / LARGE_CHUNK_SIZE);
    grouped.set(chunkIndex, [...(grouped.get(chunkIndex) || []), index]);
  }
  const rows = [];
  for (const [chunkIndex, rowIndices] of grouped) {
    const chunk = await readChunk(chunkIndex);
    rowIndices.forEach((rowIndex) => rows.push({ rowIndex, row: toRow(chunk[rowIndex % LARGE_CHUNK_SIZE] || []) }));
  }
  return rows;
}

async function patchCells(changes) {
  const dirty = new Map();
  for (const change of changes || []) {
    if (!Number.isInteger(change.rowIndex) || !Number.isInteger(change.columnIndex) || change.rowIndex < 0 || change.rowIndex >= rowCount) continue;
    const chunkIndex = Math.floor(change.rowIndex / LARGE_CHUNK_SIZE);
    const rows = dirty.get(chunkIndex) || await readChunk(chunkIndex);
    const row = rows[change.rowIndex % LARGE_CHUNK_SIZE] || [];
    row[change.columnIndex] = String(change.value ?? "");
    dirty.set(chunkIndex, rows);
    duplicateValueCache.delete(change.columnIndex);
  }
  for (const [chunkIndex, rows] of dirty) await writeChunk(chunkIndex, rows);
}

async function transformColumns(operation) {
  const columnIndex = Number(operation.columnIndex);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const rows = await readChunk(chunkIndex);
    rows.forEach((row, offset) => {
      if (operation.type === "add-derived") {
        if (operation.mode === "sequence") row[columnIndex] = String(chunkIndex * LARGE_CHUNK_SIZE + offset + 1);
        else if (operation.mode === "copy") row[columnIndex] = String(row[operation.sourceColumnIndex] ?? "");
        else if (operation.mode === "constant") row[columnIndex] = String(operation.constantValue ?? "");
        else row[columnIndex] = "";
      } else if (operation.type === "add-concatenated") {
        row[columnIndex] = (operation.items || []).map((item) => {
          const alias = item.alias || `Column ${Number(item.columnIndex) + 1}`;
          return `# ${alias}\n\`\`\`markdown\n${String(row[item.columnIndex] ?? "")}\n\`\`\``;
        }).join("\n\n");
      } else if (operation.type === "delete-column") row.splice(columnIndex, 1);
    });
    await writeChunk(chunkIndex, rows);
  }
  if (Array.isArray(operation.headers)) headers = operation.headers;
  duplicateValueCache = new Map();
}

async function computeUniqueValues(columnIndex) {
  const counts = new Map();
  await forEachRow((row) => { const value = String(row[columnIndex] ?? ""); counts.set(value, (counts.get(value) || 0) + 1); });
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => compareCells(a.value, b.value));
}

async function computeColumnProfile(columnIndex) {
  const values = new Map();
  await forEachRow((row, index) => values.set(index, row[columnIndex] ?? ""));
  return buildColumnProfile(rowCount, (index) => values.get(index) ?? "");
}

async function handleMessage(event) {
  const message = event.data || {};
  try {
    if (message.kind === "load-large-file") {
      const startedAt = Date.now();
      await openStorage(message.storeName);
      const parsed = message.fileKind === "JSONL"
        ? await parseJsonlFile(message.file, message)
        : await parseCsvFile(message.file, message);
      self.postMessage({ type: "loaded", result: {
        headers,
        issues: parsed.issues,
        rowCount,
        file: { name: message.file.name, size: message.file.size, lastModified: message.file.lastModified, encoding: parsed.encoding, delimiter, parseMs: Date.now() - startedAt, kind: dataKind },
      } });
      return;
    }
    if (message.kind === "query") {
      const result = await runQuery(message.request || {});
      self.postMessage({ type: "query-complete", token: message.token, result }, [result.viewIndices.buffer, result.matchedRows.buffer]);
      return;
    }
    if (message.kind === "get-rows") {
      self.postMessage({ type: "rows", token: message.token, rows: await getRows(message.indices) });
      return;
    }
    if (message.kind === "patch-cells") {
      await patchCells(message.changes);
      self.postMessage({ type: "patched", token: message.token });
      return;
    }
    if (message.kind === "transform-columns") {
      await transformColumns(message.operation || {});
      self.postMessage({ type: "columns-transformed", token: message.token });
      return;
    }
    if (message.kind === "unique-values") {
      self.postMessage({ type: "unique-values-complete", token: message.token, columnIndex: message.columnIndex, values: await computeUniqueValues(message.columnIndex) });
      return;
    }
    if (message.kind === "column-profile") {
      self.postMessage({ type: "column-profile-complete", token: message.token, columnIndex: message.columnIndex, profile: await computeColumnProfile(message.columnIndex) });
    }
  } catch (error) {
    self.postMessage({ type: "error", token: message.token, message: error?.message || String(error) });
  }
}

self.onmessage = (event) => {
  operationQueue = operationQueue.then(() => handleMessage(event));
  return operationQueue;
};
