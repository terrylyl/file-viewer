const INDEX_PREVIEW_SOURCE_BYTES = 4096;
const INDEX_PREVIEW_CHARS = 500;
// 多返回一个字符，主线程的 summarize() 才能区分"正好 500 字符"和"被截断了"。
const INDEX_PREVIEW_SLICE_CHARS = INDEX_PREVIEW_CHARS + 1;
// 一整行小于这个字节数时整行读一次，避免逐 cell slice；超过的行按 cell 限量读。
const INDEX_PREVIEW_ROW_INLINE_MAX_BYTES = 64 * 1024;
const INDEX_PREVIEW_READ_CONCURRENCY = 16;
const INDEX_READ_BATCH_BYTES = 8 * 1024 * 1024;
const INDEX_PROGRESS_INTERVAL_MS = 150;
const INDEX_UNIQUE_VALUE_LIMIT = 2000;
const INDEX_UNIQUE_VALUE_MAX_CHARS = 2000;
const ISSUE_SAMPLE_LIMIT = 1000;
const ISSUE_SAMPLE_MAX_BYTES = 4096;
// 与 shared/csv-utils.js 的 CSV_TOLERANCE_MAX_CHARS 对应：宽容解析的字节预算。
const INDEX_TOLERANCE_MAX_BYTES = 1024 * 1024;
const CELL_FLAG_QUOTED = 1;

const BYTE_QUOTE = 0x22;
const BYTE_EQUALS = 0x3d;
const BYTE_OPEN_PAREN = 0x28;
const BYTE_CLOSE_PAREN = 0x29;
const BYTE_BACKSLASH = 0x5c;
const BYTE_BACKTICK = 0x60;
const BYTE_OPEN_BRACE = 0x7b;
const BYTE_CLOSE_BRACE = 0x7d;
const BYTE_OPEN_BRACKET = 0x5b;
const BYTE_CLOSE_BRACKET = 0x5d;
const BYTE_LINE_FEED = 0x0a;
const BYTE_CARRIAGE_RETURN = 0x0d;

let sourceFile = null;
let sourceEncoding = "utf-8";
let sourceEncodingName = "UTF-8";
let sourceDecoder = new TextDecoder("utf-8");
let sourceIsMultiByteLead = false;
let sourceColumnCount = 0;
let headers = [];
let rawHeaders = [];
let dataKind = "CSV";
let delimiter = ",";
let rowCount = 0;
let rowCellOffsets = new Uint32Array([0]);
let cellStarts = new Uint32Array();
let cellEnds = new Uint32Array();
let cellFlags = new Uint8Array();
let jsonlRowStarts = new Uint32Array();
let jsonlRowEnds = new Uint32Array();
let virtualColumns = new Map();
let cellOverrides = new Map();
let duplicateValueCache = new Map();
let operationQueue = Promise.resolve();
let latestQueryToken = 0;
let latestScanToken = 0;

function setSourceEncoding(label, name) {
  sourceEncoding = label;
  sourceEncodingName = name;
  sourceDecoder = new TextDecoder(label);
  // GB18030/GBK 的次字节落在 0x40-0xFE，会和 ASCII 的 \ [ { | ` 重叠。
  // 字节级扫描必须跳过首字节之后的次字节，否则汉字会被当成转义符或结构起始。
  sourceIsMultiByteLead = label === "gb18030" || label === "gbk";
}

// 可增长的定长数组：直接写 TypedArray，避免每个 cell 在普通数组里留一个装箱数字。
function createGrowableU32(initialCapacity = 1024) {
  let data = new Uint32Array(initialCapacity);
  let length = 0;
  return {
    push(value) {
      if (length === data.length) {
        const next = new Uint32Array(data.length * 2);
        next.set(data);
        data = next;
      }
      data[length] = value;
      length += 1;
    },
    get length() {
      return length;
    },
    truncate(nextLength) {
      length = nextLength;
    },
    toTyped() {
      return data.slice(0, length);
    },
  };
}

function createGrowableU8(initialCapacity = 1024) {
  let data = new Uint8Array(initialCapacity);
  let length = 0;
  return {
    push(value) {
      if (length === data.length) {
        const next = new Uint8Array(data.length * 2);
        next.set(data);
        data = next;
      }
      data[length] = value;
      length += 1;
    },
    get length() {
      return length;
    },
    truncate(nextLength) {
      length = nextLength;
    },
    toTyped() {
      return data.slice(0, length);
    },
  };
}

function normalizeHeaders(raw, columnCount) {
  const used = new Map();
  return Array.from({ length: columnCount }, (_, index) => {
    const source = raw[index] == null || raw[index] === "" ? `Column ${index + 1}` : String(raw[index]);
    const seen = used.get(source) || 0;
    used.set(source, seen + 1);
    return seen ? `${source} (${seen + 1})` : source;
  });
}

// 采样是按固定字节数截的，很可能把一个多字节字符切成两半。
// 不回退到字符边界的话，正常的 UTF-8 中文文件会因为末尾半个字而被判成 GB18030。
function trimToUtf8Boundary(bytes) {
  for (let back = 0; back < 4 && back < bytes.length; back += 1) {
    const index = bytes.length - 1 - back;
    const byte = bytes[index];
    if ((byte & 0xc0) === 0x80) continue;
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return back + 1 >= needed ? bytes : bytes.subarray(0, index);
  }
  return bytes;
}

function chooseEncoding(bytes, requested) {
  if (requested && requested !== "auto") return { label: requested, name: requested.toUpperCase() };
  const sample = trimToUtf8Boundary(bytes);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return { label: "utf-8", name: "UTF-8" };
  } catch (error) {
    // TextDecoder("gb18030") 不支持 fatal，永远不抛异常，
    // 必须自己检查替换字符，否则任何非 UTF-8 采样都会被无条件判成 GB18030。
    if (!new TextDecoder("gb18030").decode(sample).includes("�")) {
      return { label: "gb18030", name: "GB18030/GBK" };
    }
    return { label: "utf-8", name: "UTF-8 (replacement)" };
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

function createProgressReporter(file, label, maxProgress = 0.94) {
  let lastReportedAt = 0;
  return (processedBytes, force = false, stage = "建立偏移索引") => {
    const now = Date.now();
    if (!force && now - lastReportedAt < INDEX_PROGRESS_INTERVAL_MS) return;
    lastReportedAt = now;
    self.postMessage({
      type: "progress",
      progress: Math.min(maxProgress, processedBytes / Math.max(1, file.size) * maxProgress),
      stage: `${stage} ${label} · ${Math.round(processedBytes / 1024 / 1024).toLocaleString()} / ${Math.round(file.size / 1024 / 1024).toLocaleString()} MiB · ${rowCount.toLocaleString()} 行`,
    });
  };
}

function normalizeDecodedCsvCell(text, flags, complete = true) {
  let value = String(text ?? "");
  if (flags & CELL_FLAG_QUOTED) {
    if (value.startsWith('"')) value = value.slice(1);
    if (complete && value.endsWith('"')) value = value.slice(0, -1);
    value = value.replaceAll('""', '"');
  }
  return value;
}

function isJsonStructureLeadByte(open, next) {
  if (open === BYTE_OPEN_BRACE) return next === BYTE_QUOTE || next === BYTE_CLOSE_BRACE;
  return (
    next === BYTE_QUOTE ||
    next === BYTE_OPEN_BRACE ||
    next === BYTE_OPEN_BRACKET ||
    next === BYTE_CLOSE_BRACKET ||
    next === 0x2d ||
    next === 0x74 ||
    next === 0x66 ||
    next === 0x6e ||
    (next >= 0x30 && next <= 0x39)
  );
}

function createCsvByteIndexer(file, delimiterByte, reportProgress, headerIndex = 0) {
  const starts = createGrowableU32(4096);
  const ends = createGrowableU32(4096);
  const flags = createGrowableU8(4096);
  const offsets = createGrowableU32(1024);
  offsets.push(0);
  let headerDescriptors = null;
  let nonEmptyRecordIndex = 0;
  let maxColumns = 0;
  let currentRecord = [];
  let fieldStart = 0;
  let fieldStarted = false;
  let fieldHasNonWhitespace = false;
  let fieldQuoted = false;
  let fieldLeadsWithEquals = false;
  let fieldBracketSurplus = 0;
  let fieldBracketDeficit = 0;
  let fieldEscapes = [];
  let inQuotes = false;
  let pendingQuote = false;
  let pendingBackslash = false;
  let pendingEscapedQuote = false;
  let pendingTrailByte = false;
  let skipLineFeed = false;
  let codeFence = false;
  let backtickRun = 0;
  let leadingFenceEligible = true;
  let leadingBacktickCount = 0;
  let structureStack = [];
  let structureInString = false;
  let structureEscaped = false;
  let structurePendingOpen = 0;
  let structurePendingQuote = false;
  let specMode = "";
  let specBytes = null;
  let specLength = 0;
  let specStartOffset = 0;
  let specFieldStart = 0;
  let specFieldStarted = false;
  let specFieldHasNonWhitespace = false;
  let specFieldQuoted = false;
  let specFieldLeadsWithEquals = false;
  let specFieldBracketSurplus = 0;
  let specFieldBracketDeficit = 0;
  let specEscapeLength = 0;
  let specInQuotes = false;
  let specRecordLength = 0;
  let specFirstLineMatchesHeader = false;
  let specPhysicalLineIndex = 0;
  let specLineFields = 1;
  let specLineHasContent = false;
  let specLineFieldStarted = false;
  let specLineInQuotes = false;
  let specLineQuotePending = false;
  let specLineAfterQuote = false;
  let specLineInvalid = false;
  let specLineLastSignificantIsDelimiter = false;
  let specLineSkipNext = false;
  let specLineSkipLineFeed = false;
  let toleranceDisabled = false;
  let sawUndoubledQuote = false;

  const isWhitespaceByte = (byte) => byte === 0x20 || byte === 0x09 || byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN;

  const appendFieldByte = (byte, countsAsContent = true) => {
    // 公式修复要的两样东西：字段是不是以 `=` 开头，以及括号的盈亏。
    // 都在扫描时顺手记下来，免得为此把 cell 解码出来。
    if (countsAsContent && !isWhitespaceByte(byte)) {
      if (!fieldHasNonWhitespace) fieldLeadsWithEquals = byte === BYTE_EQUALS;
      fieldHasNonWhitespace = true;
      if (byte === BYTE_OPEN_PAREN || byte === BYTE_OPEN_BRACKET || byte === BYTE_OPEN_BRACE) {
        fieldBracketSurplus += 1;
      } else if (byte === BYTE_CLOSE_PAREN || byte === BYTE_CLOSE_BRACKET || byte === BYTE_CLOSE_BRACE) {
        if (fieldBracketSurplus > 0) fieldBracketSurplus -= 1;
        else fieldBracketDeficit += 1;
      }
    }
    fieldStarted = true;
  };

  // 必须在处理入口字节之前调用：现场快照不含入口字节，缓冲区第一个字节就是它，
  // 回滚时才能从 specStartOffset 原样重放。
  const beginSpeculation = (mode, offset, entryByte) => {
    if (!specBytes) specBytes = new Uint8Array(INDEX_TOLERANCE_MAX_BYTES);
    specMode = mode;
    specBytes[0] = entryByte;
    specLength = 1;
    specStartOffset = offset;
    specFieldStart = fieldStart;
    specFieldStarted = fieldStarted;
    specFieldHasNonWhitespace = fieldHasNonWhitespace;
    specFieldQuoted = fieldQuoted;
    specFieldLeadsWithEquals = fieldLeadsWithEquals;
    specFieldBracketSurplus = fieldBracketSurplus;
    specFieldBracketDeficit = fieldBracketDeficit;
    specEscapeLength = fieldEscapes.length;
    specInQuotes = inQuotes;
    specRecordLength = currentRecord.length;
    specFirstLineMatchesHeader = false;
    specPhysicalLineIndex = 0;
    specLineFields = specRecordLength + 1;
    specLineHasContent = true;
    specLineFieldStarted = true;
    specLineInQuotes = specInQuotes;
    specLineQuotePending = false;
    specLineAfterQuote = false;
    specLineInvalid = false;
    specLineLastSignificantIsDelimiter = false;
    specLineSkipNext = false;
    specLineSkipLineFeed = false;
  };

  // 推测性解析吞掉的内容同时用严格 CSV 行状态记账。只有候选首行和后续物理行
  // 都能独立组成表头列数，才有足够证据说明开括号只是普通文本。
  const trackSpeculationLine = (byte) => {
    specLineHasContent = true;
    if (specLineSkipNext) {
      specLineSkipNext = false;
      specLineFieldStarted = true;
      return;
    }
    if (sourceIsMultiByteLead && byte >= 0x81 && byte <= 0xfe) {
      // GB18030 双字节字符的次字节可能与 ASCII 标点重叠，影子解析也必须跳过。
      specLineSkipNext = true;
      specLineFieldStarted = true;
      specLineLastSignificantIsDelimiter = false;
      return;
    }
    if (byte !== 0x20 && byte !== 0x09) specLineLastSignificantIsDelimiter = byte === delimiterByte;
    if (specLineInvalid) return;
    if (specLineQuotePending) {
      if (byte === BYTE_QUOTE) {
        specLineQuotePending = false;
        return;
      }
      specLineQuotePending = false;
      specLineInQuotes = false;
      specLineAfterQuote = true;
    }
    if (specLineInQuotes) {
      if (byte === BYTE_QUOTE) specLineQuotePending = true;
      return;
    }
    if (specLineAfterQuote) {
      if (byte === delimiterByte) {
        specLineFields += 1;
        specLineFieldStarted = false;
        specLineAfterQuote = false;
      } else if (byte !== 0x20 && byte !== 0x09) {
        specLineInvalid = true;
      }
      return;
    }
    if (byte === delimiterByte) {
      specLineFields += 1;
      specLineFieldStarted = false;
      return;
    }
    if (byte === BYTE_QUOTE) {
      if (!specLineFieldStarted) {
        specLineFieldStarted = true;
        specLineInQuotes = true;
      }
      // 非字段起始位置的引号按普通字节处理，与关闭宽容模式后的解析行为一致。
      return;
    }
    specLineFieldStarted = true;
  };

  const resetSpeculationLine = () => {
    specLineFields = 1;
    specLineHasContent = false;
    specLineFieldStarted = false;
    specLineInQuotes = false;
    specLineQuotePending = false;
    specLineAfterQuote = false;
    specLineInvalid = false;
    specLineLastSignificantIsDelimiter = false;
    specLineSkipNext = false;
  };

  const speculationLineMatchesHeader = () => {
    if (!headerDescriptors || !specLineHasContent || specLineInvalid) return false;
    if (specLineInQuotes && !specLineQuotePending) return false;
    return specLineFields === headerDescriptors.length;
  };

  const finishSpeculationPhysicalLine = (byte) => {
    if (byte === BYTE_LINE_FEED && specLineSkipLineFeed) {
      specLineSkipLineFeed = false;
      return false;
    }
    const matchesHeader = speculationLineMatchesHeader();
    if (specPhysicalLineIndex === 0) {
      specFirstLineMatchesHeader = matchesHeader && !specLineLastSignificantIsDelimiter;
    }
    // 行尾停在分隔符上的行更像跨行 JSON 的续行，不是自成一体的记录；
    // 首行已有这条保护，后续行同样需要。
    const contradicts = specPhysicalLineIndex > 0
      && specFirstLineMatchesHeader
      && matchesHeader
      && !specLineLastSignificantIsDelimiter;
    specPhysicalLineIndex += 1;
    resetSpeculationLine();
    specLineSkipLineFeed = byte === BYTE_CARRIAGE_RETURN;
    return contradicts;
  };

  const speculationContradictsHeaderAtEof = () => {
    return (
      specMode === "structure" &&
      specPhysicalLineIndex > 0 &&
      specFirstLineMatchesHeader &&
      speculationLineMatchesHeader()
    );
  };

  const endSpeculation = () => {
    specMode = "";
    specLength = 0;
  };

  const closeStructuredSpeculation = () => {
    let validJson = false;
    try {
      JSON.parse(sourceDecoder.decode(specBytes.subarray(0, specLength)));
      validJson = true;
    } catch (error) {
      // 括号配平不代表内容就是 JSON；普通文本优先回到标准 CSV 规则。
    }
    if (!validJson || !headerDescriptors) {
      rollbackSpeculation();
      return;
    }
    endSpeculation();
  };

  const updateStructuredState = (byte) => {
    if (structureEscaped) {
      structureEscaped = false;
      return;
    }
    if (structureInString) {
      if (byte === BYTE_BACKSLASH) structureEscaped = true;
      else if (byte === BYTE_QUOTE) structureInString = false;
      return;
    }
    if (byte === BYTE_QUOTE) {
      structureInString = true;
      return;
    }
    if (byte === BYTE_OPEN_BRACE || byte === BYTE_OPEN_BRACKET) {
      structureStack.push(byte);
      return;
    }
    const open = structureStack.at(-1);
    if ((byte === BYTE_CLOSE_BRACE && open === BYTE_OPEN_BRACE) || (byte === BYTE_CLOSE_BRACKET && open === BYTE_OPEN_BRACKET)) {
      structureStack.pop();
      if (!structureStack.length) closeStructuredSpeculation();
      return;
    }
    if (byte === BYTE_CLOSE_BRACE || byte === BYTE_CLOSE_BRACKET) {
      structureStack = [];
      structureInString = false;
      structureEscaped = false;
      closeStructuredSpeculation();
    }
  };

  const appendStructuredByte = (byte) => {
    appendFieldByte(byte);
    updateStructuredState(byte);
  };

  const resetField = (nextStart) => {
    fieldStart = nextStart;
    fieldStarted = false;
    fieldHasNonWhitespace = false;
    fieldQuoted = false;
    fieldLeadsWithEquals = false;
    fieldBracketSurplus = 0;
    fieldBracketDeficit = 0;
    fieldEscapes = [];
    inQuotes = false;
    pendingQuote = false;
    pendingBackslash = false;
    pendingEscapedQuote = false;
    codeFence = false;
    backtickRun = 0;
    leadingFenceEligible = true;
    leadingBacktickCount = 0;
    structureStack = [];
    structureInString = false;
    structureEscaped = false;
    structurePendingOpen = 0;
    structurePendingQuote = false;
    toleranceDisabled = false;
    endSpeculation();
  };

  const finishField = (endOffset, nextStart) => {
    currentRecord.push({
      start: fieldStart,
      end: endOffset,
      flags: fieldQuoted ? CELL_FLAG_QUOTED : 0,
      escapes: fieldEscapes.length ? fieldEscapes : null,
      leadsWithEquals: fieldLeadsWithEquals,
      bracketSurplus: fieldBracketSurplus,
      bracketDeficit: fieldBracketDeficit,
    });
    resetField(nextStart);
  };

  const isDescriptorEmpty = (descriptor) => {
    const length = descriptor.end - descriptor.start;
    if (length <= 0) return true;
    return (descriptor.flags & CELL_FLAG_QUOTED) !== 0 && length === 2;
  };

  // 未加引号的公式 `=IF(A1 > 0, B1, C1)` 会被逗号切开。普通路径的
  // repairFormulaRecord 按括号配平合并回去，这里按同一套算法合并 descriptor：
  // 相邻 descriptor 合并就是取 first.start→last.end 一段字节，分隔符天然含在里面。
  const mergeDescriptors = (record, from, to) => {
    const first = record[from];
    let escapes = null;
    for (let index = from; index <= to; index += 1) {
      if (!record[index].escapes) continue;
      escapes = escapes ? escapes.concat(record[index].escapes) : record[index].escapes.slice();
    }
    return {
      start: first.start,
      end: record[to].end,
      flags: first.flags,
      escapes,
      leadsWithEquals: first.leadsWithEquals,
      bracketSurplus: 0,
      bracketDeficit: 0,
    };
  };

  const repairFormulaRecord = () => {
    if (!headerDescriptors) return;
    const expected = headerDescriptors.length;
    if (!expected || currentRecord.length <= expected) return;
    const repaired = [];
    let changed = false;

    for (let index = 0; index < currentRecord.length; index += 1) {
      const remainingOutput = expected - repaired.length;
      const remainingFields = currentRecord.length - index;
      if (remainingFields === remainingOutput) {
        for (let rest = index; rest < currentRecord.length; rest += 1) repaired.push(currentRecord[rest]);
        break;
      }

      const startIndex = index;
      if (currentRecord[index].leadsWithEquals) {
        // 括号深度按夹逼累计：先减亏欠（不低于 0）再加盈余，等价于普通路径
        // 对整段文本做的逐字符计数。
        let depth = currentRecord[index].bracketSurplus;
        while (
          depth > 0
          && index + 1 < currentRecord.length
          && currentRecord.length - (index + 2) >= remainingOutput - 1
        ) {
          index += 1;
          depth = Math.max(0, depth - currentRecord[index].bracketDeficit) + currentRecord[index].bracketSurplus;
        }
        if (depth === 0 && index > startIndex) {
          repaired.push(mergeDescriptors(currentRecord, startIndex, index));
          changed = true;
          continue;
        }
        index = startIndex;
      }

      repaired.push(currentRecord[index]);
    }

    if (changed && repaired.length === expected) currentRecord = repaired;
  };

  // 未加引号的 `\` + 分隔符会被当成转义而少切一列（Windows 路径 C:\dir\,next）。
  // 只有这一行确实比表头短时才按记录到的转义位置拆回来。
  const repairShortRecord = () => {
    if (!headerDescriptors) return;
    const expected = headerDescriptors.length;
    if (!expected || currentRecord.length >= expected) return;
    let missing = expected - currentRecord.length;
    const repaired = [];
    for (const descriptor of currentRecord) {
      if (missing <= 0 || !descriptor.escapes) {
        repaired.push(descriptor);
        continue;
      }
      const takes = Math.min(missing, descriptor.escapes.length);
      let cursor = descriptor.start;
      for (let index = 0; index < takes; index += 1) {
        repaired.push({ start: cursor, end: descriptor.escapes[index], flags: descriptor.flags, escapes: null });
        cursor = descriptor.escapes[index] + 1;
      }
      repaired.push({ start: cursor, end: descriptor.end, flags: descriptor.flags, escapes: null });
      missing -= takes;
    }
    if (repaired.length === expected) currentRecord = repaired;
  };

  const finishRecord = () => {
    // 顺序与普通路径一致：先按公式合并多切的列，再按反斜杠拆回少切的列
    repairFormulaRecord();
    repairShortRecord();
    // 表头之前的全空记录（文件开头的空行、",,"占位行）既不是表头也不是数据行，
    // 直接丢掉；与普通路径 parseCsvText 的口径保持一致。
    if (!headerDescriptors && !currentRecord.some((descriptor) => !isDescriptorEmpty(descriptor))) {
      currentRecord = [];
      return;
    }
    maxColumns = Math.max(maxColumns, currentRecord.length);
    // headerIndex 由采样阶段算好：在它之前的标题行按数据行写入，顺序不变。
    if (!headerDescriptors && nonEmptyRecordIndex === headerIndex) {
      headerDescriptors = currentRecord;
      nonEmptyRecordIndex += 1;
    } else if (currentRecord.some((descriptor) => !isDescriptorEmpty(descriptor))) {
      nonEmptyRecordIndex += 1;
      for (const descriptor of currentRecord) {
        starts.push(descriptor.start);
        ends.push(descriptor.end);
        flags.push(descriptor.flags);
      }
      offsets.push(starts.length);
      rowCount += 1;
    }
    currentRecord = [];
  };

  const rollbackSpeculation = () => {
    const replay = specBytes.slice(0, specLength);
    const replayOffset = specStartOffset;
    fieldStart = specFieldStart;
    fieldStarted = specFieldStarted;
    fieldHasNonWhitespace = specFieldHasNonWhitespace;
    fieldQuoted = specFieldQuoted;
    fieldLeadsWithEquals = specFieldLeadsWithEquals;
    fieldBracketSurplus = specFieldBracketSurplus;
    fieldBracketDeficit = specFieldBracketDeficit;
    fieldEscapes.length = specEscapeLength;
    inQuotes = specInQuotes;
    currentRecord.length = specRecordLength;
    endSpeculation();
    structurePendingOpen = 0;
    structurePendingQuote = false;
    structureStack = [];
    structureInString = false;
    structureEscaped = false;
    codeFence = false;
    backtickRun = 0;
    leadingBacktickCount = 0;
    pendingQuote = false;
    pendingBackslash = false;
    pendingEscapedQuote = false;
    toleranceDisabled = true;
    // 走 feedByte 而不是 processByte：重放过程中如果又开启了一次推测性解析，
    // 它的缓冲区也必须被填上，否则嵌套回滚会重放一段不完整的字节。
    for (let index = 0; index < replay.length; index += 1) feedByte(replay[index], replayOffset + index);
  };

  const processByte = (byte, offset) => {
    if (skipLineFeed) {
      skipLineFeed = false;
      if (byte === BYTE_LINE_FEED) {
        fieldStart = offset + 1;
        return;
      }
    }

    if (pendingTrailByte) {
      pendingTrailByte = false;
      appendFieldByte(byte);
      return;
    }

    if (pendingEscapedQuote) {
      pendingEscapedQuote = false;
      if (byte === delimiterByte || byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN) {
        inQuotes = false;
        processByte(byte, offset);
        return;
      }
      appendFieldByte(byte);
      return;
    }

    if (pendingBackslash) {
      pendingBackslash = false;
      if (byte === BYTE_QUOTE && inQuotes) {
        pendingEscapedQuote = true;
        return;
      }
      if (byte === BYTE_QUOTE || byte === delimiterByte || byte === BYTE_BACKSLASH) {
        if (byte === delimiterByte && !inQuotes) fieldEscapes.push(offset);
        appendFieldByte(byte);
        return;
      }
      processByte(byte, offset);
      return;
    }

    if (pendingQuote) {
      pendingQuote = false;
      if (structureStack.length) {
        updateStructuredState(BYTE_QUOTE);
        if (byte === BYTE_QUOTE) {
          appendFieldByte(byte);
          return;
        }
        processByte(byte, offset);
        return;
      }
      if (byte === BYTE_QUOTE) {
        appendFieldByte(byte);
        return;
      }
      if (byte === delimiterByte || byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN) {
        inQuotes = false;
        processByte(byte, offset);
        return;
      }
      // 引号后面既不是引号也不是分隔符/换行：引号内有一个没有双写的 `"`
      sawUndoubledQuote = true;
      processByte(byte, offset);
      return;
    }

    if (structurePendingQuote) {
      structurePendingQuote = false;
      const open = structurePendingOpen;
      structurePendingOpen = 0;
      if (byte === delimiterByte || byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN) {
        // 那个引号是这个字段的收尾引号，开括号只是普通内容
        endSpeculation();
        inQuotes = false;
        processByte(byte, offset);
        return;
      }
      structureStack = [open];
      structureInString = false;
      structureEscaped = false;
      processByte(BYTE_QUOTE, offset - 1);
      processByte(byte, offset);
      return;
    }

    if (structurePendingOpen) {
      // 换行也是 JSON 里的合法缩进，`[\n  "a"]` 是标准 pretty-print
      if (byte === 0x20 || byte === 0x09 || byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN) {
        appendFieldByte(byte);
        return;
      }
      // 引号内的 `"` 有歧义：可能是 JSON 串的开头，也可能是本字段的收尾引号，再看一个字节
      if (inQuotes && byte === BYTE_QUOTE) {
        structurePendingQuote = true;
        return;
      }
      const open = structurePendingOpen;
      structurePendingOpen = 0;
      if (isJsonStructureLeadByte(open, byte)) {
        structureStack = [open];
        structureInString = false;
        structureEscaped = false;
        processByte(byte, offset);
        return;
      }
      // 前瞻不通过就回滚重放：等待期间可能已经吞掉了换行，
      // 直接 endSpeculation 会把记录边界一起吃掉。
      rollbackSpeculation();
      return;
    }

    // GB18030 双字节字符的次字节和 ASCII 标点重叠，必须整字符跳过再判断。
    if (sourceIsMultiByteLead && byte >= 0x81 && byte <= 0xfe) {
      pendingTrailByte = true;
      if (structureStack.length) appendStructuredByte(byte);
      else appendFieldByte(byte);
      if (!inQuotes && !codeFence && !structureStack.length) leadingFenceEligible = false;
      return;
    }

    if (inQuotes) {
      if (byte === BYTE_QUOTE) {
        appendFieldByte(byte);
        pendingQuote = true;
        return;
      }
      if (structureStack.length) {
        appendStructuredByte(byte);
        return;
      }
      if (byte === BYTE_BACKSLASH) {
        appendFieldByte(byte);
        pendingBackslash = true;
        return;
      }
      if ((byte === BYTE_OPEN_BRACE || byte === BYTE_OPEN_BRACKET) && !fieldHasNonWhitespace && !toleranceDisabled) {
        beginSpeculation("structure", offset, byte);
        appendFieldByte(byte);
        structurePendingOpen = byte;
        return;
      }
      appendFieldByte(byte);
      return;
    }

    if (codeFence) {
      appendFieldByte(byte);
      if (byte === BYTE_BACKTICK) {
        backtickRun += 1;
        if (backtickRun === 3) {
          codeFence = false;
          backtickRun = 0;
          endSpeculation();
        }
      } else {
        backtickRun = 0;
      }
      return;
    }

    if (structureStack.length) {
      appendStructuredByte(byte);
      return;
    }

    if (byte === BYTE_BACKSLASH) {
      appendFieldByte(byte);
      pendingBackslash = true;
      return;
    }

    if (byte === BYTE_QUOTE) {
      if (!fieldStarted) {
        fieldQuoted = true;
        inQuotes = true;
        appendFieldByte(byte, false);
        return;
      }
      appendFieldByte(byte);
      return;
    }

    if (byte === BYTE_BACKTICK && leadingFenceEligible && leadingBacktickCount < 3 && !toleranceDisabled) {
      if (!leadingBacktickCount) beginSpeculation("fence", offset, byte);
      appendFieldByte(byte);
      leadingBacktickCount += 1;
      if (leadingBacktickCount === 3) {
        codeFence = true;
        backtickRun = 0;
      }
      return;
    }
    if (leadingBacktickCount && leadingBacktickCount < 3 && specMode === "fence") endSpeculation();

    if ((byte === BYTE_OPEN_BRACE || byte === BYTE_OPEN_BRACKET) && !fieldHasNonWhitespace && !toleranceDisabled) {
      beginSpeculation("structure", offset, byte);
      appendFieldByte(byte);
      structurePendingOpen = byte;
      return;
    }

    if (byte === delimiterByte) {
      finishField(offset, offset + 1);
      return;
    }

    if (byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN) {
      finishField(offset, offset + 1);
      finishRecord();
      skipLineFeed = byte === BYTE_CARRIAGE_RETURN;
      return;
    }

    if (!isWhitespaceByte(byte) && byte !== BYTE_BACKTICK) leadingFenceEligible = false;
    appendFieldByte(byte);
  };

  const feedByte = (byte, offset) => {
    if (specMode) {
      if (specLength >= INDEX_TOLERANCE_MAX_BYTES) {
        rollbackSpeculation();
        feedByte(byte, offset);
        return;
      }
      specBytes[specLength] = byte;
      specLength += 1;
      if (byte === BYTE_LINE_FEED || byte === BYTE_CARRIAGE_RETURN) {
        if (finishSpeculationPhysicalLine(byte)) {
          rollbackSpeculation();
          return;
        }
      } else {
        trackSpeculationLine(byte);
      }
    }
    processByte(byte, offset);
  };

  const scan = async () => {
    const reader = file.stream().getReader();
    let processedBytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (let index = 0; index < value.length; index += 1) feedByte(value[index], processedBytes + index);
      processedBytes += value.byteLength;
      reportProgress(processedBytes);
    }
    while (speculationContradictsHeaderAtEof()) rollbackSpeculation();
    // 围栏到文件末尾都没闭合，几乎一定是把单元格里的 ``` 当成了代码块。
    if (specMode === "fence" && codeFence) rollbackSpeculation();
    if (structurePendingQuote) {
      structurePendingQuote = false;
      structurePendingOpen = 0;
      inQuotes = false;
      endSpeculation();
    }
    const unclosedStructuredField = specMode === "structure" && (
      structureStack.length > 0 || Boolean(structurePendingOpen)
    );
    if (unclosedStructuredField) rollbackSpeculation();
    const diagnostics = {
      unclosedQuotedField: inQuotes && !pendingQuote && !pendingEscapedQuote,
      unclosedStructuredField,
      unclosedCodeFence: codeFence,
      undoubledQuote: sawUndoubledQuote,
    };
    if (fieldStarted || currentRecord.length || fieldStart < file.size) {
      finishField(file.size, file.size);
      finishRecord();
    }
    return {
      starts: starts.toTyped(),
      ends: ends.toTyped(),
      flags: flags.toTyped(),
      offsets: offsets.toTyped(),
      headerDescriptors: headerDescriptors || [],
      maxColumns,
      diagnostics,
    };
  };

  return { scan };
}

async function decodeFileRange(start, end) {
  const bytes = new Uint8Array(await sourceFile.slice(start, end).arrayBuffer());
  return sourceDecoder.decode(bytes);
}

function getCellByteLength(cellIndex) {
  return Math.max(0, cellEnds[cellIndex] - cellStarts[cellIndex]);
}

function isIndexedCellEmpty(cellIndex) {
  const length = getCellByteLength(cellIndex);
  if (length <= 0) return true;
  return (cellFlags[cellIndex] & CELL_FLAG_QUOTED) !== 0 && length === 2;
}

// issue 的 sample 只需要一小段文本，按行范围限量读，不为此常驻全表预览。
async function decodeIssueSample(rowIndex) {
  const range = getIndexedRowByteRange(rowIndex);
  if (!range || range.end <= range.start) return "";
  const end = Math.min(range.end, range.start + ISSUE_SAMPLE_MAX_BYTES);
  return (await decodeFileRange(range.start, end)).slice(0, 300);
}

async function attachIssueSamples(issues) {
  for (const key of ["inconsistentRows", "sparseRows", "longFields"]) {
    for (const issue of issues[key]) {
      if (issue.sampleRowIndex == null) continue;
      issue.sample = await decodeIssueSample(issue.sampleRowIndex);
      delete issue.sampleRowIndex;
    }
  }
}

async function decodeCsvDescriptor(descriptor) {
  const text = await decodeFileRange(descriptor.start, descriptor.end);
  return normalizeDecodedCsvCell(text, descriptor.flags, true);
}

function detectDuplicateHeaderIssues(sourceHeaders) {
  const groups = new Map();
  sourceHeaders.forEach((value, index) => {
    const key = value == null || value === "" ? `Column ${index + 1}` : String(value);
    groups.set(key, [...(groups.get(key) || []), index]);
  });
  return [...groups.entries()].filter(([, indexes]) => indexes.length > 1).map(([columnName, columnIndexes]) => (
    buildIssue("重复列名", 1, columnIndexes[0], columnName, `列名出现 ${columnIndexes.length} 次：${columnIndexes.map((index) => index + 1).join(", ")}`, columnName)
  ));
}

async function loadIndexedCsv(file, options) {
  const sample = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const encoding = chooseEncoding(sample, options.encoding);
  setSourceEncoding(encoding.label, encoding.name);
  // 采样只有前 512 KiB，超过这个体积的文件末尾那条记录是半截的，不能当完整证据。
  const sampleText = sourceDecoder.decode(trimToUtf8Boundary(sample));
  const sampleOptions = { truncated: file.size > sample.byteLength };
  delimiter = options.delimiter || detectCsvDelimiter(sampleText, sampleOptions);
  dataKind = "CSV";
  rowCount = 0;
  const issues = createIssues();
  const reportProgress = createProgressReporter(file, "CSV");
  // 表头行由采样文本判定，索引器按记录序号认表头，不必为此缓冲整条流。
  // options.headerRow 是用户手动指定的第几条非空记录（1 起），优先于自动识别。
  const headerIndex = options.headerRow > 0
    ? options.headerRow - 1
    : findCsvHeaderIndex(sampleCsvRecords(sampleText, delimiter, sampleOptions));
  const indexer = createCsvByteIndexer(file, delimiter.charCodeAt(0), reportProgress, headerIndex);
  const indexed = await indexer.scan();
  cellStarts = indexed.starts;
  cellEnds = indexed.ends;
  cellFlags = indexed.flags;
  rowCellOffsets = indexed.offsets;
  rawHeaders = [];
  for (const descriptor of indexed.headerDescriptors) rawHeaders.push(await decodeCsvDescriptor(descriptor));
  sourceColumnCount = Math.max(rawHeaders.length, indexed.maxColumns);
  headers = normalizeHeaders(rawHeaders, sourceColumnCount);
  issues.duplicateColumns = detectDuplicateHeaderIssues(rawHeaders);
  if (headerIndex > 0 && !(options.headerRow > 0)) {
    addIssue(issues, "inconsistentRows", buildIssue(
      "表头不在首行",
      1,
      -1,
      "",
      `前 ${headerIndex} 行只有一个单元格，已按标题行处理：表头取自第 ${headerIndex + 1} 行，这些行仍作为数据行保留`,
      "",
    ));
  }
  // 与普通路径一致：整表只剩一列时主动提示分隔符可能判错，别静默。
  if (sourceColumnCount <= 1 && rowCount > 0) {
    const alternative = findCsvDelimiterAlternative(sampleText, delimiter, sampleOptions);
    if (alternative) {
      addIssue(issues, "inconsistentRows", buildIssue(
        "分隔符可能判断有误",
        1,
        -1,
        "",
        `整表只解析出 1 列；改用「${describeCsvDelimiter(alternative.delimiter)}」可切出 ${alternative.columns} 列，请确认源文件的分隔符`,
        rawHeaders[0] || "",
      ));
    }
  }
  // 只用偏移索引判定问题行，样本文本稍后按需读取，避免为此常驻整表预览。
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const startCell = rowCellOffsets[rowIndex];
    const columnCount = rowCellOffsets[rowIndex + 1] - startCell;
    const rowNumber = rowIndex + 2;
    if (columnCount !== rawHeaders.length) {
      const issue = buildIssue("列数不一致", rowNumber, -1, "", `期望 ${rawHeaders.length} 列，实际 ${columnCount} 列`, "");
      issue.sampleRowIndex = rowIndex;
      addIssue(issues, "inconsistentRows", issue);
    }
    let emptyCount = sourceColumnCount - columnCount;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      if (isIndexedCellEmpty(startCell + columnIndex)) emptyCount += 1;
    }
    if (sourceColumnCount > 1 && emptyCount / sourceColumnCount >= 0.6) {
      const issue = buildIssue("空字段比例高", rowNumber, -1, "", `空字段 ${emptyCount}/${sourceColumnCount}`, "");
      issue.sampleRowIndex = rowIndex;
      addIssue(issues, "sparseRows", issue);
    }
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const byteLength = getCellByteLength(startCell + columnIndex);
      if (byteLength >= 50000) {
        const issue = buildIssue("超长字段", rowNumber, columnIndex, headers[columnIndex] || `Column ${columnIndex + 1}`, `至少 ${byteLength} 字节`, "");
        issue.sampleRowIndex = rowIndex;
        addIssue(issues, "longFields", issue);
      }
    }
  }
  await attachIssueSamples(issues);
  // 与普通路径一致：未双写的引号只有在真的切出列数不一致时才提示
  if (indexed.diagnostics.undoubledQuote && issues.inconsistentRows.some((issue) => issue.type === "列数不一致")) {
    addIssue(issues, "inconsistentRows", buildIssue(CSV_UNDOUBLED_QUOTE_ISSUE, 1, -1, "", CSV_UNDOUBLED_QUOTE_DETAIL, ""));
  }
  const parserWarning = describeCsvParserDiagnostics(indexed.diagnostics);
  if (parserWarning) addIssue(issues, "inconsistentRows", buildIssue("复杂字段未闭合", rowCount + 1, -1, "", parserWarning, "请检查源 CSV 的引号、JSON/数组括号或 Markdown 代码块"));
  reportProgress(file.size, true, "索引完成");
  return { issues };
}

async function scanJsonlLineOffsets(file, reportProgress) {
  const starts = [];
  const ends = [];
  const reader = file.stream().getReader();
  let processedBytes = 0;
  let lineStart = 0;
  let skipLineFeed = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (let index = 0; index < value.length; index += 1) {
      const byte = value[index];
      const absoluteOffset = processedBytes + index;
      if (skipLineFeed) {
        skipLineFeed = false;
        if (byte === 0x0a) {
          lineStart = absoluteOffset + 1;
          continue;
        }
      }
      if (byte !== 0x0a && byte !== 0x0d) continue;
      const end = absoluteOffset;
      if (end > lineStart) {
        starts.push(lineStart);
        ends.push(end);
      }
      lineStart = end + 1;
      skipLineFeed = byte === 0x0d;
    }
    processedBytes += value.byteLength;
    reportProgress(processedBytes);
  }
  if (lineStart < file.size) {
    starts.push(lineStart);
    ends.push(file.size);
  }
  return { starts, ends };
}

function stringifyJsonlValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch (error) { return String(value); }
}

async function readJsonlObject(rowIndex) {
  const text = await decodeFileRange(jsonlRowStarts[rowIndex], jsonlRowEnds[rowIndex]);
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`第 ${rowIndex + 1} 行不是 JSON object`);
  return value;
}

function parseJsonlObjectFromBuffer(rowIndex, bytes, bufferStart) {
  const start = jsonlRowStarts[rowIndex] - bufferStart;
  const end = jsonlRowEnds[rowIndex] - bufferStart;
  const value = JSON.parse(sourceDecoder.decode(bytes.subarray(start, end)));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`第 ${rowIndex + 1} 行不是 JSON object`);
  return value;
}

// 全表扫描不需要先去重排序，直接顺序成批，省掉一次 Set + sort。
function buildSequentialBatches() {
  const batches = [];
  let current = null;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const range = getIndexedRowByteRange(rowIndex);
    if (!current || range.end - current.start > INDEX_READ_BATCH_BYTES) {
      current = { start: range.start, end: range.end, rows: [rowIndex] };
      batches.push(current);
    } else {
      current.end = Math.max(current.end, range.end);
      current.rows.push(rowIndex);
    }
  }
  return batches;
}

function buildJsonlReadBatches() {
  return buildSequentialBatches();
}

async function loadIndexedJsonl(file, options) {
  const sample = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const encoding = chooseEncoding(sample, options.encoding);
  setSourceEncoding(encoding.label, encoding.name);
  delimiter = "JSON Lines";
  dataKind = "JSONL";
  rowCount = 0;
  const issues = createIssues();
  const reportProgress = createProgressReporter(file, "JSONL", 0.42);
  const offsets = await scanJsonlLineOffsets(file, reportProgress);
  jsonlRowStarts = Uint32Array.from(offsets.starts);
  jsonlRowEnds = Uint32Array.from(offsets.ends);
  rowCount = jsonlRowStarts.length;
  const keyIndexes = new Map();
  rawHeaders = [];
  let lastRowProgressAt = 0;
  // 列名必须扫全表才能确定，但只保留 key 集合，不缓存每行的值。
  for (const batch of buildJsonlReadBatches()) {
    const bytes = new Uint8Array(await sourceFile.slice(batch.start, batch.end).arrayBuffer());
    for (const rowIndex of batch.rows) {
      let value;
      try {
        value = parseJsonlObjectFromBuffer(rowIndex, bytes, batch.start);
      } catch (error) {
        throw new Error(`第 ${rowIndex + 1} 行 JSON 解析失败：${error.message}`);
      }
      for (const key of Object.keys(value)) {
        if (!keyIndexes.has(key)) {
          keyIndexes.set(key, keyIndexes.size);
          rawHeaders.push(key);
        }
      }
    }
    const now = Date.now();
    if (now - lastRowProgressAt >= INDEX_PROGRESS_INTERVAL_MS) {
      lastRowProgressAt = now;
      const scanned = batch.rows[batch.rows.length - 1] + 1;
      self.postMessage({
        type: "progress",
        progress: 0.42 + scanned / Math.max(1, rowCount) * 0.52,
        stage: `建立 JSONL 列索引 · ${scanned.toLocaleString()} / ${rowCount.toLocaleString()} 行`,
      });
    }
  }
  sourceColumnCount = rawHeaders.length;
  headers = normalizeHeaders(rawHeaders, sourceColumnCount);
  self.postMessage({ type: "progress", progress: 0.94, stage: `索引完成 JSONL · ${rowCount.toLocaleString()} 行` });
  return { issues };
}

function getCsvRowByteRange(rowIndex) {
  const startCell = rowCellOffsets[rowIndex];
  const endCell = rowCellOffsets[rowIndex + 1];
  if (startCell == null || endCell == null || endCell <= startCell) return { start: 0, end: 0 };
  return { start: cellStarts[startCell], end: cellEnds[endCell - 1] };
}

function getIndexedRowByteRange(rowIndex) {
  if (dataKind === "JSONL") return { start: jsonlRowStarts[rowIndex], end: jsonlRowEnds[rowIndex] };
  return getCsvRowByteRange(rowIndex);
}

function buildReadBatches(indices) {
  const sorted = [...new Set(indices || [])].filter((index) => Number.isInteger(index) && index >= 0 && index < rowCount).sort((a, b) => a - b);
  const batches = [];
  let current = null;
  for (const rowIndex of sorted) {
    const range = getIndexedRowByteRange(rowIndex);
    if (!current || range.end - current.start > INDEX_READ_BATCH_BYTES) {
      current = { start: range.start, end: range.end, rows: [rowIndex] };
      batches.push(current);
    } else {
      current.end = Math.max(current.end, range.end);
      current.rows.push(rowIndex);
    }
  }
  return batches;
}

function decodeCsvRowFromBuffer(rowIndex, bytes, bufferStart, maxCellBytes = 0) {
  const row = Array.from({ length: sourceColumnCount }, () => "");
  const startCell = rowCellOffsets[rowIndex];
  const endCell = rowCellOffsets[rowIndex + 1];
  for (let cellIndex = startCell; cellIndex < endCell; cellIndex += 1) {
    const columnIndex = cellIndex - startCell;
    if (columnIndex >= sourceColumnCount) break;
    const start = cellStarts[cellIndex] - bufferStart;
    let end = cellEnds[cellIndex] - bufferStart;
    const complete = !maxCellBytes || end - start <= maxCellBytes;
    if (!complete) end = start + maxCellBytes;
    const text = sourceDecoder.decode(bytes.subarray(start, end));
    row[columnIndex] = normalizeDecodedCsvCell(text, cellFlags[cellIndex], complete);
  }
  return row;
}

function getOverrideKey(rowIndex, columnIndex) {
  return `${rowIndex}:${columnIndex}`;
}

function resolveRowValue(rowIndex, columnIndex, sourceRow, stack = new Set()) {
  const key = getOverrideKey(rowIndex, columnIndex);
  if (cellOverrides.has(key)) return cellOverrides.get(key);
  if (columnIndex < sourceColumnCount) return String(sourceRow[columnIndex] ?? "");
  if (stack.has(columnIndex)) return "";
  const definition = virtualColumns.get(columnIndex);
  if (!definition) return "";
  stack.add(columnIndex);
  let value = "";
  if (definition.type === "add-derived") {
    if (definition.mode === "sequence") value = String(rowIndex + 1);
    else if (definition.mode === "copy") value = resolveRowValue(rowIndex, Number(definition.sourceColumnIndex), sourceRow, stack);
    else if (definition.mode === "constant") value = String(definition.constantValue ?? "");
  } else if (definition.type === "add-concatenated") {
    value = (definition.items || []).map((item) => {
      const itemColumnIndex = Number(item.columnIndex);
      const alias = item.alias || `Column ${itemColumnIndex + 1}`;
      return `# ${alias}\n\`\`\`markdown\n${resolveRowValue(rowIndex, itemColumnIndex, sourceRow, stack)}\n\`\`\``;
    }).join("\n\n");
  }
  stack.delete(columnIndex);
  return value;
}

function materializeRow(rowIndex, sourceRow) {
  return Array.from({ length: headers.length }, (_, columnIndex) => resolveRowValue(rowIndex, columnIndex, sourceRow));
}

async function readIndexedRows(indices, batches = null) {
  const rowsByIndex = new Map();
  for (const batch of batches || buildReadBatches(indices)) {
    const bytes = new Uint8Array(await sourceFile.slice(batch.start, batch.end).arrayBuffer());
    for (const rowIndex of batch.rows) {
      let sourceRow;
      if (dataKind === "JSONL") {
        const value = parseJsonlObjectFromBuffer(rowIndex, bytes, batch.start);
        sourceRow = rawHeaders.map((key) => stringifyJsonlValue(value[key]));
      } else {
        sourceRow = decodeCsvRowFromBuffer(rowIndex, bytes, batch.start);
      }
      rowsByIndex.set(rowIndex, materializeRow(rowIndex, sourceRow));
    }
  }
  const requested = indices || (batches || []).flatMap((batch) => batch.rows);
  return requested.filter((rowIndex) => rowsByIndex.has(rowIndex)).map((rowIndex) => ({ rowIndex, row: rowsByIndex.get(rowIndex) }));
}

function resolvePreviewValue(rowIndex, columnIndex, sourcePreview, stack = new Set()) {
  const key = getOverrideKey(rowIndex, columnIndex);
  if (cellOverrides.has(key)) return String(cellOverrides.get(key)).slice(0, INDEX_PREVIEW_SLICE_CHARS);
  if (columnIndex < sourceColumnCount) return String(sourcePreview[columnIndex] ?? "");
  if (stack.has(columnIndex)) return "";
  const definition = virtualColumns.get(columnIndex);
  if (!definition) return "";
  stack.add(columnIndex);
  let value = "";
  if (definition.type === "add-derived") {
    if (definition.mode === "sequence") value = String(rowIndex + 1);
    else if (definition.mode === "copy") value = resolvePreviewValue(rowIndex, Number(definition.sourceColumnIndex), sourcePreview, stack);
    else if (definition.mode === "constant") value = String(definition.constantValue ?? "");
  } else if (definition.type === "add-concatenated") {
    value = (definition.items || []).map((item) => {
      const itemColumnIndex = Number(item.columnIndex);
      const alias = item.alias || `Column ${itemColumnIndex + 1}`;
      return `# ${alias}\n\`\`\`markdown\n${resolvePreviewValue(rowIndex, itemColumnIndex, sourcePreview, stack)}\n\`\`\``;
    }).join("\n\n");
  }
  stack.delete(columnIndex);
  return value.slice(0, INDEX_PREVIEW_SLICE_CHARS);
}

// 预览按需从原文件读，不再为全表常驻预览字符串——那是大文件内存的主要来源。
// 整行较小时一次读完整行，超大行退化为逐 cell 限量读，避免为了预览拖进 100 MB 的单元格。
async function readSourcePreviewRows(indices) {
  const previews = new Map();
  const inlineRows = [];
  const hugeRows = [];
  for (const rowIndex of indices) {
    const range = getIndexedRowByteRange(rowIndex);
    if (range.end - range.start <= INDEX_PREVIEW_ROW_INLINE_MAX_BYTES) inlineRows.push(rowIndex);
    else hugeRows.push(rowIndex);
  }

  for (const batch of buildReadBatches(inlineRows)) {
    const bytes = new Uint8Array(await sourceFile.slice(batch.start, batch.end).arrayBuffer());
    for (const rowIndex of batch.rows) {
      if (dataKind === "JSONL") {
        const value = parseJsonlObjectFromBuffer(rowIndex, bytes, batch.start);
        previews.set(rowIndex, rawHeaders.map((key) => stringifyJsonlValue(value[key])));
      } else {
        previews.set(rowIndex, decodeCsvRowFromBuffer(rowIndex, bytes, batch.start));
      }
    }
  }

  const cellPreviewReads = [];
  for (const rowIndex of hugeRows) {
    if (dataKind === "JSONL") {
      const value = await readJsonlObject(rowIndex);
      previews.set(rowIndex, rawHeaders.map((key) => stringifyJsonlValue(value[key])));
      continue;
    }
    const startCell = rowCellOffsets[rowIndex];
    const endCell = rowCellOffsets[rowIndex + 1];
    const row = Array.from({ length: sourceColumnCount }, () => "");
    for (let cellIndex = startCell; cellIndex < endCell; cellIndex += 1) {
      const columnIndex = cellIndex - startCell;
      if (columnIndex >= sourceColumnCount) break;
      const start = cellStarts[cellIndex];
      const complete = cellEnds[cellIndex] - start <= INDEX_PREVIEW_SOURCE_BYTES;
      const end = complete ? cellEnds[cellIndex] : start + INDEX_PREVIEW_SOURCE_BYTES;
      cellPreviewReads.push({ row, columnIndex, cellIndex, start, end, complete });
    }
    previews.set(rowIndex, row);
  }

  // 超长行不能整行读入，但逐 cell 串行 slice 会让一屏预览等待数百次 I/O。
  // 每次只读取至多 4 KiB，以固定并发数执行，峰值内存仍与文件大小脱钩。
  let nextCellPreview = 0;
  const readers = Array.from(
    { length: Math.min(INDEX_PREVIEW_READ_CONCURRENCY, cellPreviewReads.length) },
    async () => {
      while (nextCellPreview < cellPreviewReads.length) {
        const request = cellPreviewReads[nextCellPreview];
        nextCellPreview += 1;
        const text = await decodeFileRange(request.start, request.end);
        request.row[request.columnIndex] = normalizeDecodedCsvCell(
          text,
          cellFlags[request.cellIndex],
          request.complete,
        );
      }
    },
  );
  await Promise.all(readers);

  return previews;
}

async function getRowPreviews(indices) {
  const wanted = (indices || []).filter((rowIndex) => Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < rowCount);
  const sourcePreviews = await readSourcePreviewRows(wanted);
  return wanted.map((rowIndex) => {
    const sourceRow = sourcePreviews.get(rowIndex) || [];
    const sourceLengths = Array.from(
      { length: sourceColumnCount },
      (_, columnIndex) => getCellByteLengthForRow(rowIndex, columnIndex),
    );
    const truncated = sourceRow.map((value) => String(value ?? "").slice(0, INDEX_PREVIEW_SLICE_CHARS));
    return {
      rowIndex,
      row: Array.from({ length: headers.length }, (_, columnIndex) => resolvePreviewValue(rowIndex, columnIndex, truncated)),
      lengths: Array.from({ length: headers.length }, (_, columnIndex) => {
        const override = cellOverrides.get(getOverrideKey(rowIndex, columnIndex));
        if (override != null) return String(override).length;
        if (columnIndex < sourceColumnCount) return sourceLengths[columnIndex] || 0;
        return resolvePreviewValue(rowIndex, columnIndex, truncated).length;
      }),
    };
  });
}

// 返回字节长度：主线程只拿它估算缓存占用，不用于展示。
function getCellByteLengthForRow(rowIndex, columnIndex) {
  if (dataKind === "JSONL") return 0;
  const startCell = rowCellOffsets[rowIndex];
  const endCell = rowCellOffsets[rowIndex + 1];
  const cellIndex = startCell + columnIndex;
  if (cellIndex >= endCell) return 0;
  return getCellByteLength(cellIndex);
}

async function getCell(rowIndex, columnIndex) {
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex) || rowIndex < 0 || rowIndex >= rowCount) return null;
  const overrideKey = getOverrideKey(rowIndex, columnIndex);
  if (cellOverrides.has(overrideKey)) {
    return { rowIndex, columnIndex, value: String(cellOverrides.get(overrideKey) ?? "") };
  }
  if (dataKind === "CSV" && columnIndex < sourceColumnCount) {
    const startCell = rowCellOffsets[rowIndex];
    const endCell = rowCellOffsets[rowIndex + 1];
    const cellIndex = startCell + columnIndex;
    if (cellIndex >= endCell) return { rowIndex, columnIndex, value: "" };
    const text = await decodeFileRange(cellStarts[cellIndex], cellEnds[cellIndex]);
    return { rowIndex, columnIndex, value: normalizeDecodedCsvCell(text, cellFlags[cellIndex], true) };
  }
  const rows = await readIndexedRows([rowIndex]);
  return { rowIndex, columnIndex, value: String(rows[0]?.row?.[columnIndex] ?? "") };
}

// scope 决定用哪个 token 判活："query" 跟随最新查询，"scan" 跟随最新的唯一值/列画像请求。
// 两者都必须可取消，否则一次列筛选就会把整表扫描钉死在队列里。
async function forEachIndexedRow(callback, token = null, scope = "query") {
  const batches = buildSequentialBatches();
  const isStale = () => (scope === "scan" ? token !== latestScanToken : token !== latestQueryToken);
  let processed = 0;
  for (const batch of batches) {
    if (token != null && isStale()) return false;
    const rows = await readIndexedRows(null, [batch]);
    for (const item of rows) await callback(item.row, item.rowIndex);
    processed += batch.rows.length;
    if (token != null) {
      self.postMessage({ type: "operation-progress", token, progress: processed / Math.max(1, rowCount), stage: `扫描长文本 · ${processed.toLocaleString()} / ${rowCount.toLocaleString()} 行` });
    }
  }
  return true;
}

function rowMatches(row, request, needle) {
  const selectedColumn = Number(request.selectedColumn);
  if (selectedColumn >= 0) return normalizeForSearch(row[selectedColumn] || "", request.caseSensitive).includes(needle);
  return row.some((cell) => normalizeForSearch(cell || "", request.caseSensitive).includes(needle));
}

function fingerprintValue(value) {
  const text = String(value ?? "");
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`;
}

async function getDuplicateValues(columnIndex, token = null) {
  if (duplicateValueCache.has(columnIndex)) return duplicateValueCache.get(columnIndex);
  const counts = new Map();
  await forEachIndexedRow((row) => {
    const value = String(row[columnIndex] ?? "");
    if (value.trim()) {
      const fingerprint = fingerprintValue(value);
      counts.set(fingerprint, (counts.get(fingerprint) || 0) + 1);
    }
  }, token);
  const values = new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
  duplicateValueCache.set(columnIndex, values);
  return values;
}

function canRunIndexOnlyQuery(request) {
  return !request.query && !(request.filters || []).length && !(request.duplicateColumns || []).length && !(request.sort?.column >= 0 && request.sort?.direction !== "none");
}

function buildIndexOnlyQueryResult(request) {
  const hiddenRows = new Set(request.hiddenRows || []);
  const view = [];
  for (let index = 0; index < rowCount; index += 1) if (!hiddenRows.has(index)) view.push(index);
  const windowed = applyRowWindow(view, request.rowWindow);
  return { viewIndices: Uint32Array.from(windowed), matchedRows: new Uint32Array() };
}

async function runQuery(request, token) {
  if (canRunIndexOnlyQuery(request)) return buildIndexOnlyQueryResult(request);
  const needle = request.query ? normalizeForSearch(String(request.query), request.caseSensitive) : "";
  const hiddenRows = new Set(request.hiddenRows || []);
  const filters = (request.filters || []).map((filter) => ({ ...filter, valueSet: new Set(filter.values || []) }));
  const duplicateFilters = [];
  for (const columnIndex of new Set(request.duplicateColumns || [])) duplicateFilters.push({ columnIndex: Number(columnIndex), values: await getDuplicateValues(Number(columnIndex), token) });
  const view = [];
  const matches = [];
  const sortValues = request.sort?.column >= 0 && request.sort?.direction !== "none" ? new Map() : null;
  const completed = await forEachIndexedRow((row, index) => {
    if (hiddenRows.has(index) || !rowPassesColumnFilters(row, filters)) return;
    if (duplicateFilters.some((filter) => !filter.values.has(fingerprintValue(row[filter.columnIndex] ?? "")))) return;
    const hit = needle ? rowMatches(row, request, needle) : false;
    if (hit) matches.push(index);
    if (!needle || !request.matchedOnly || hit) view.push(index);
    if (sortValues) sortValues.set(index, row[request.sort.column] ?? "");
  }, token);
  if (!completed || token !== latestQueryToken) return null;
  if (sortValues) {
    const direction = request.sort.direction === "asc" ? 1 : -1;
    view.sort((a, b) => compareCells(sortValues.get(a), sortValues.get(b)) * direction);
  }
  const windowed = applyRowWindow(view, request.rowWindow);
  return { viewIndices: Uint32Array.from(windowed), matchedRows: Uint32Array.from(matches) };
}

async function patchCells(changes) {
  for (const change of changes || []) {
    if (!Number.isInteger(change.rowIndex) || !Number.isInteger(change.columnIndex) || change.rowIndex < 0 || change.rowIndex >= rowCount) continue;
    cellOverrides.set(getOverrideKey(change.rowIndex, change.columnIndex), String(change.value ?? ""));
    duplicateValueCache.delete(change.columnIndex);
  }
}

function reindexVirtualColumnsAfterDelete(removedColumnIndex) {
  const next = new Map();
  for (const [columnIndex, definition] of virtualColumns) {
    if (columnIndex === removedColumnIndex) continue;
    const nextDefinition = { ...definition };
    if (Number(nextDefinition.sourceColumnIndex) > removedColumnIndex) nextDefinition.sourceColumnIndex -= 1;
    if (Array.isArray(nextDefinition.items)) {
      nextDefinition.items = nextDefinition.items.map((item) => ({
        ...item,
        columnIndex: Number(item.columnIndex) > removedColumnIndex ? Number(item.columnIndex) - 1 : Number(item.columnIndex),
      }));
    }
    next.set(columnIndex > removedColumnIndex ? columnIndex - 1 : columnIndex, nextDefinition);
  }
  virtualColumns = next;
  const nextOverrides = new Map();
  for (const [key, value] of cellOverrides) {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    if (columnIndex === removedColumnIndex) continue;
    nextOverrides.set(getOverrideKey(rowIndex, columnIndex > removedColumnIndex ? columnIndex - 1 : columnIndex), value);
  }
  cellOverrides = nextOverrides;
}

async function transformColumns(operation) {
  const columnIndex = Number(operation.columnIndex);
  if (operation.type === "delete-column") reindexVirtualColumnsAfterDelete(columnIndex);
  else virtualColumns.set(columnIndex, { ...operation });
  if (Array.isArray(operation.headers)) headers = [...operation.headers];
  duplicateValueCache = new Map();
}

async function computeUniqueValues(columnIndex, token) {
  const counts = new Map();
  let truncated = false;
  const completed = await forEachIndexedRow((row) => {
    const value = String(row[columnIndex] ?? "");
    if (value.length > INDEX_UNIQUE_VALUE_MAX_CHARS) {
      truncated = true;
      return;
    }
    if (!counts.has(value) && counts.size >= INDEX_UNIQUE_VALUE_LIMIT) {
      truncated = true;
      return;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  }, token, "scan");
  if (!completed) return null;
  return {
    values: [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => compareCells(a.value, b.value)),
    truncated,
  };
}

async function computeColumnProfile(columnIndex, token) {
  const values = new Map();
  const completed = await forEachIndexedRow(
    (row, index) => values.set(index, String(row[columnIndex] ?? "").slice(0, INDEX_UNIQUE_VALUE_MAX_CHARS)),
    token,
    "scan",
  );
  if (!completed) return null;
  return buildColumnProfile(rowCount, (index) => values.get(index) ?? "");
}

async function handleMessage(event) {
  const message = event.data || {};
  try {
    if (message.kind === "load-large-file") {
      const startedAt = Date.now();
      sourceFile = message.file;
      virtualColumns = new Map();
      cellOverrides = new Map();
      duplicateValueCache = new Map();
      const parsed = message.fileKind === "JSONL"
        ? await loadIndexedJsonl(sourceFile, message)
        : await loadIndexedCsv(sourceFile, message);
      self.postMessage({ type: "loaded", result: {
        headers,
        issues: parsed.issues,
        rowCount,
        indexed: true,
        file: { name: sourceFile.name, size: sourceFile.size, lastModified: sourceFile.lastModified, encoding: sourceEncodingName, delimiter, parseMs: Date.now() - startedAt, kind: dataKind },
      } });
      return;
    }
    if (message.kind === "query") {
      const result = await runQuery(message.request || {}, message.token);
      if (!result) return;
      self.postMessage({ type: "query-complete", token: message.token, result }, [result.viewIndices.buffer, result.matchedRows.buffer]);
      return;
    }
    if (message.kind === "get-previews") {
      self.postMessage({ type: "previews", token: message.token, rows: await getRowPreviews(message.indices) });
      return;
    }
    if (message.kind === "get-cell") {
      self.postMessage({ type: "cell", token: message.token, cell: await getCell(message.rowIndex, message.columnIndex) });
      return;
    }
    if (message.kind === "get-rows") {
      self.postMessage({ type: "rows", token: message.token, rows: await readIndexedRows(message.indices) });
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
      const result = await computeUniqueValues(message.columnIndex, message.token);
      if (!result) return;
      self.postMessage({ type: "unique-values-complete", token: message.token, columnIndex: message.columnIndex, ...result });
      return;
    }
    if (message.kind === "column-profile") {
      const profile = await computeColumnProfile(message.columnIndex, message.token);
      if (!profile) return;
      self.postMessage({ type: "column-profile-complete", token: message.token, columnIndex: message.columnIndex, profile });
    }
  } catch (error) {
    self.postMessage({ type: "error", token: message.token, message: error?.message || String(error) });
  }
}

// 视口读取只依赖不可变的偏移索引和 overrides，不需要排在长扫描后面等着；
// 否则打开一次列筛选就会把滚动冻结到全表扫描结束。
const IMMEDIATE_MESSAGE_KINDS = new Set(["get-previews", "get-cell", "get-rows"]);

self.onmessage = (event) => {
  const kind = event.data?.kind;
  if (kind === "query") latestQueryToken = event.data.token;
  if (kind === "unique-values" || kind === "column-profile") latestScanToken = event.data.token;
  if (IMMEDIATE_MESSAGE_KINDS.has(kind) && sourceFile) return handleMessage(event);
  operationQueue = operationQueue.then(() => handleMessage(event));
  return operationQueue;
};
