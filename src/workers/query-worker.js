let queryChunks = [];
let queryRowCount = 0;
let queryChunkSize = 5000;
const duplicateValueCache = new Map();

function getQueryRow(index) {
  if (index < 0 || index >= queryRowCount) return null;
  const chunk = queryChunks[Math.floor(index / queryChunkSize)];
  return chunk ? chunk[index % queryChunkSize] || null : null;
}

function rowMatches(row, request, needle) {
  if (!needle) return false;
  const selectedColumn = Number(request.selectedColumn);
  if (selectedColumn >= 0) {
    return normalizeForSearch(row[selectedColumn] || "", request.caseSensitive).includes(needle);
  }
  for (const cell of row) {
    if (normalizeForSearch(cell, request.caseSensitive).includes(needle)) return true;
  }
  return false;
}

function getDuplicateValues(columnIndex) {
  if (duplicateValueCache.has(columnIndex)) return duplicateValueCache.get(columnIndex);
  const counts = new Map();
  for (let index = 0; index < queryRowCount; index += 1) {
    const row = getQueryRow(index);
    if (!row) continue;
    const value = row[columnIndex] == null ? "" : String(row[columnIndex]);
    if (!value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const duplicates = new Set();
  for (const [value, count] of counts) {
    if (count > 1) duplicates.add(value);
  }
  duplicateValueCache.set(columnIndex, duplicates);
  return duplicates;
}

function rowPassesDuplicateFilters(row, duplicateFilters) {
  for (const filter of duplicateFilters) {
    const value = row[filter.columnIndex] == null ? "" : String(row[filter.columnIndex]);
    if (!filter.values.has(value)) return false;
  }
  return true;
}

function runQuery(request) {
  const query = String(request.query || "");
  const needle = query ? normalizeForSearch(query, request.caseSensitive) : "";
  const matchedOnly = Boolean(request.matchedOnly);
  const hiddenRows = new Set(request.hiddenRows || []);
  const filters = (request.filters || []).map((filter) => ({
    ...filter,
    valueSet: new Set(filter.values || []),
  }));
  const duplicateFilters = [...new Set(request.duplicateColumns || [])]
    .map((columnIndex) => Number(columnIndex))
    .filter((columnIndex) => Number.isInteger(columnIndex) && columnIndex >= 0)
    .map((columnIndex) => ({ columnIndex, values: getDuplicateValues(columnIndex) }));
  const viewIndices = [];
  const matchedRows = [];

  for (let index = 0; index < queryRowCount; index += 1) {
    if (hiddenRows.has(index)) continue;
    const row = getQueryRow(index);
    if (!row) continue;
    if (!rowPassesColumnFilters(row, filters)) continue;
    if (!rowPassesDuplicateFilters(row, duplicateFilters)) continue;
    const hit = needle ? rowMatches(row, request, needle) : false;
    if (hit) matchedRows.push(index);
    if (!needle || !matchedOnly || hit) viewIndices.push(index);
  }

  if (request.sort && request.sort.column >= 0 && request.sort.direction !== "none") {
    const column = request.sort.column;
    const direction = request.sort.direction === "asc" ? 1 : -1;
    viewIndices.sort((a, b) => compareCells(getQueryRow(a)?.[column], getQueryRow(b)?.[column]) * direction);
  }

  return { viewIndices: applyRowWindow(viewIndices, request.rowWindow), matchedRows };
}

function computeUniqueValues(columnIndex) {
  const counts = new Map();
  for (let index = 0; index < queryRowCount; index += 1) {
    const row = getQueryRow(index);
    if (!row) continue;
    const value = row[columnIndex] == null ? "" : String(row[columnIndex]);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareCells(a.value, b.value));
}

function computeColumnProfile(columnIndex) {
  return buildColumnProfile(queryRowCount, (rowIndex) => getQueryRow(rowIndex)?.[columnIndex] ?? "");
}

self.__QUERY_CORE__ = {
  tokenizeListCellValue,
  evaluateColumnFilterCondition,
  rowPassesColumnFilters,
  normalizeRowWindow,
  applyRowWindow,
};

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.kind === "set-data") {
    queryChunks = Array.isArray(message.chunks) ? message.chunks : [];
    queryRowCount = Number.isInteger(message.rowCount) ? message.rowCount : queryChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    queryChunkSize = Number.isInteger(message.chunkSize) && message.chunkSize > 0 ? message.chunkSize : 5000;
    duplicateValueCache.clear();
    self.postMessage({ type: "ready", version: message.version });
    return;
  }
  if (message.kind === "patch-cells") {
    for (const change of message.changes || []) {
      const row = getQueryRow(change.rowIndex);
      if (!row) continue;
      row[change.columnIndex] = String(change.value ?? "");
      duplicateValueCache.delete(change.columnIndex);
    }
    return;
  }
  if (message.kind === "query") {
    try {
      const result = runQuery(message.request || {});
      self.postMessage({
        type: "query-complete",
        token: message.token,
        version: message.version,
        result,
      });
    } catch (error) {
      self.postMessage({
        type: "query-error",
        token: message.token,
        version: message.version,
        message: error && error.message ? error.message : String(error),
      });
    }
  }
  if (message.kind === "unique-values") {
    try {
      self.postMessage({
        type: "unique-values-complete",
        token: message.token,
        version: message.version,
        columnIndex: message.columnIndex,
        values: computeUniqueValues(message.columnIndex),
      });
    } catch (error) {
      self.postMessage({
        type: "unique-values-error",
        token: message.token,
        version: message.version,
        columnIndex: message.columnIndex,
        message: error && error.message ? error.message : String(error),
      });
    }
  }
  if (message.kind === "column-profile") {
    try {
      self.postMessage({
        type: "column-profile-complete",
        token: message.token,
        version: message.version,
        columnIndex: message.columnIndex,
        profile: computeColumnProfile(message.columnIndex),
      });
    } catch (error) {
      self.postMessage({
        type: "column-profile-error",
        token: message.token,
        version: message.version,
        columnIndex: message.columnIndex,
        message: error && error.message ? error.message : String(error),
      });
    }
  }
};
