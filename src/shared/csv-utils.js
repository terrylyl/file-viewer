const CSV_NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function escapeSpreadsheetFormula(value) {
  const text = value == null ? "" : String(value);
  const leading = text.trimStart();
  if (!/^[=+\-@]/.test(leading)) return text;
  // 纯数值不是公式：给 -5 / +1.5e3 加前缀会把数字列变成文本列。
  if (CSV_NUMERIC_PATTERN.test(leading)) return text;
  return `'${text}`;
}

// 解析器对未加引号的 JSON、反斜杠转义和 Markdown 围栏是宽容的，
// 因此导出时这些触发字符也必须加引号，否则自己导出的文件自己读不回来。
function needsCsvQuoting(text) {
  if (/[",\r\n\t;\\`]/.test(text)) return true;
  return /^\s*[{[]/.test(text);
}

function escapeCsv(value) {
  const text = escapeSpreadsheetFormula(value);
  if (needsCsvQuoting(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

// 宽容解析（未加引号的 JSON、Markdown 围栏）一旦不闭合就会吞掉后面所有内容。
// 超过这个字符预算就判定为误判，回滚到字段开头按标准 CSV 重新解析。
const CSV_TOLERANCE_MAX_CHARS = 1024 * 1024;

// `{` / `[` 只有后面真的跟着 JSON 才进入结构化模式，
// 避免 `[TODO`、`{草稿` 这类普通文本吞掉整个文件。
function isJsonStructureLead(open, next) {
  if (open === "{") return next === '"' || next === "}";
  return (
    next === '"' ||
    next === "{" ||
    next === "[" ||
    next === "]" ||
    next === "-" ||
    next === "t" ||
    next === "f" ||
    next === "n" ||
    (next >= "0" && next <= "9")
  );
}

function createCsvRecordParser(delimiter = ",") {
  let field = "";
  let record = [];
  let learnedColumns = 0;
  let started = false;
  let inQuotes = false;
  let pendingQuote = false;
  let pendingBackslash = false;
  let pendingEscapedQuote = false;
  let skipLineFeed = false;
  let codeFence = false;
  let backtickRun = 0;
  let structureStack = [];
  let structureInString = false;
  let structureEscaped = false;
  let structurePendingOpen = "";
  let structurePendingQuote = false;
  let specMode = "";
  let specBuffer = "";
  let specField = "";
  let specRecordLength = 0;
  let specStarted = false;
  let specInQuotes = false;
  let toleranceDisabled = false;
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
  let specLineSkipLineFeed = false;
  let diagnostics = { unclosedQuotedField: false, unclosedStructuredField: false, unclosedCodeFence: false };

  // 进入推测性解析前记录现场，预算用尽或到达文件末尾仍未闭合时可以回滚重放。
  const beginSpeculation = (mode, entryChar) => {
    specMode = mode;
    specBuffer = entryChar;
    specField = field;
    specRecordLength = record.length;
    specStarted = started;
    specInQuotes = inQuotes;
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
    specLineSkipLineFeed = false;
  };

  // 推测性解析吞掉的内容同时用严格 CSV 行状态记账。只有候选首行和后续物理行
  // 都能独立组成表头列数，才有足够证据说明开括号只是普通文本。
  const trackSpeculationLine = (ch) => {
    specLineHasContent = true;
    if (ch !== " " && ch !== "\t") specLineLastSignificantIsDelimiter = ch === delimiter;
    if (specLineInvalid) return;
    if (specLineQuotePending) {
      if (ch === '"') {
        specLineQuotePending = false;
        return;
      }
      specLineQuotePending = false;
      specLineInQuotes = false;
      specLineAfterQuote = true;
    }
    if (specLineInQuotes) {
      if (ch === '"') specLineQuotePending = true;
      return;
    }
    if (specLineAfterQuote) {
      if (ch === delimiter) {
        specLineFields += 1;
        specLineFieldStarted = false;
        specLineAfterQuote = false;
      } else if (ch !== " " && ch !== "\t") {
        specLineInvalid = true;
      }
      return;
    }
    if (ch === delimiter) {
      specLineFields += 1;
      specLineFieldStarted = false;
      return;
    }
    if (ch === '"') {
      if (!specLineFieldStarted) {
        specLineFieldStarted = true;
        specLineInQuotes = true;
      }
      // 非字段起始位置的引号按普通字符处理，与关闭宽容模式后的解析行为一致。
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
  };

  const speculationLineMatchesHeader = () => {
    if (!learnedColumns || !specLineHasContent || specLineInvalid) return false;
    if (specLineInQuotes && !specLineQuotePending) return false;
    return specLineFields === learnedColumns;
  };

  const finishSpeculationPhysicalLine = (ch) => {
    if (ch === "\n" && specLineSkipLineFeed) {
      specLineSkipLineFeed = false;
      return false;
    }
    const matchesHeader = speculationLineMatchesHeader();
    if (specPhysicalLineIndex === 0) {
      specFirstLineMatchesHeader = matchesHeader && !specLineLastSignificantIsDelimiter;
    }
    const contradicts = specPhysicalLineIndex > 0 && specFirstLineMatchesHeader && matchesHeader;
    specPhysicalLineIndex += 1;
    resetSpeculationLine();
    specLineSkipLineFeed = ch === "\r";
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
    specBuffer = "";
  };

  const closeStructuredSpeculation = (records) => {
    let validJson = false;
    try {
      JSON.parse(specBuffer);
      validJson = true;
    } catch (error) {
      // 括号配平不代表内容就是 JSON；普通文本优先回到标准 CSV 规则。
    }
    if (!validJson || !learnedColumns) {
      rollbackSpeculation(records);
      return;
    }
    endSpeculation();
  };

  const rollbackSpeculation = (records) => {
    const replay = specBuffer;
    field = specField;
    started = specStarted;
    inQuotes = specInQuotes;
    record.length = specRecordLength;
    endSpeculation();
    structurePendingOpen = "";
    structurePendingQuote = false;
    structureStack = [];
    structureInString = false;
    structureEscaped = false;
    codeFence = false;
    backtickRun = 0;
    pendingQuote = false;
    pendingBackslash = false;
    pendingEscapedQuote = false;
    toleranceDisabled = true;
    // 走 feed 而不是 processCharacter：重放过程中如果又开启了一次推测性解析，
    // 它的缓冲区也必须被填上，否则嵌套回滚会重放一段不完整的文本。
    for (const ch of replay) feed(ch, records);
  };

  const emitRecord = (records) => {
    record.push(field);
    if (!learnedColumns) learnedColumns = record.length;
    records.push(record);
    field = "";
    record = [];
    started = false;
    inQuotes = false;
    pendingQuote = false;
    pendingBackslash = false;
    pendingEscapedQuote = false;
    skipLineFeed = false;
    codeFence = false;
    backtickRun = 0;
    structureStack = [];
    structureInString = false;
    structureEscaped = false;
    structurePendingOpen = "";
    toleranceDisabled = false;
    endSpeculation();
  };

  const appendStructuredCharacter = (ch, records) => {
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
      if (!structureStack.length) closeStructuredSpeculation(records);
      return;
    }
    if (ch === "}" || ch === "]") {
      structureStack = [];
      structureInString = false;
      structureEscaped = false;
      closeStructuredSpeculation(records);
    }
  };

  // 先只记下开括号，等下一个字符确认像 JSON 再真正进入结构化模式。
  const startPendingStructure = (ch) => {
    if (!toleranceDisabled) {
      beginSpeculation("structure", ch);
      structurePendingOpen = ch;
    }
    field += ch;
    started = true;
  };

  const processCharacter = (ch, records) => {
    if (skipLineFeed) {
      skipLineFeed = false;
      if (ch === "\n") return;
    }

    if (structurePendingQuote) {
      structurePendingQuote = false;
      const open = structurePendingOpen;
      structurePendingOpen = "";
      if (ch === delimiter || ch === "\n" || ch === "\r") {
        // 那个引号是这个字段的收尾引号，开括号只是普通内容，例如导出的 "{"
        endSpeculation();
        inQuotes = false;
        processCharacter(ch, records);
        return;
      }
      // 引号后面还有内容，说明是没做双写转义的 JSON 串，按结构化字段处理
      structureStack = [open];
      structureInString = false;
      structureEscaped = false;
      processCharacter('"', records);
      processCharacter(ch, records);
      return;
    }

    if (structurePendingOpen) {
      if (ch === " " || ch === "\t") {
        field += ch;
        started = true;
        return;
      }
      // 引号内的 `"` 有歧义：可能是 JSON 串的开头，也可能是本字段的收尾引号，再看一个字符
      if (inQuotes && ch === '"') {
        structurePendingQuote = true;
        return;
      }
      const open = structurePendingOpen;
      structurePendingOpen = "";
      if (isJsonStructureLead(open, ch)) {
        structureStack = [open];
        structureInString = false;
        structureEscaped = false;
      } else {
        endSpeculation();
      }
      processCharacter(ch, records);
      return;
    }

    if (pendingEscapedQuote) {
      pendingEscapedQuote = false;
      if (ch === delimiter || ch === "\n" || ch === "\r") {
        // 反斜杠属于字段内容，那个引号是收尾引号，例如 "C:\dir\",next
        field += "\\";
        started = true;
        inQuotes = false;
        processCharacter(ch, records);
        return;
      }
      field += '\\"';
      started = true;
      processCharacter(ch, records);
      return;
    }

    if (pendingBackslash) {
      pendingBackslash = false;
      if (ch === '"' && inQuotes) {
        // 可能是转义引号，也可能是以反斜杠结尾的字段的收尾引号，再看一个字符才能定
        pendingEscapedQuote = true;
        return;
      }
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
        appendStructuredCharacter('"', records);
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
        appendStructuredCharacter(ch, records);
        return;
      }
      if (ch === "\\") {
        pendingBackslash = true;
        return;
      }
      if ((ch === "{" || ch === "[") && !field.trim()) {
        startPendingStructure(ch);
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
          endSpeculation();
        }
      } else {
        backtickRun = 0;
      }
      return;
    }

    if (structureStack.length) {
      appendStructuredCharacter(ch, records);
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

    if (ch === "`" && !toleranceDisabled && /^`{0,2}$/.test(field.trim())) {
      if (!backtickRun) beginSpeculation("fence", ch);
      field += ch;
      started = true;
      backtickRun += 1;
      if (backtickRun === 3) {
        codeFence = true;
        backtickRun = 0;
      }
      return;
    }
    if (backtickRun) {
      backtickRun = 0;
      if (specMode === "fence") endSpeculation();
    }

    if ((ch === "{" || ch === "[") && !field.trim()) {
      startPendingStructure(ch);
      return;
    }

    if (ch === delimiter) {
      record.push(field);
      field = "";
      started = true;
      toleranceDisabled = false;
      endSpeculation();
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

  const feed = (ch, records) => {
    if (specMode) {
      specBuffer += ch;
      if (specBuffer.length > CSV_TOLERANCE_MAX_CHARS) {
        // 缓冲区里已经包含这个字符，回滚时会一起重放
        rollbackSpeculation(records);
        return;
      }
      if (ch === "\n" || ch === "\r") {
        if (finishSpeculationPhysicalLine(ch)) {
          rollbackSpeculation(records);
          return;
        }
      } else {
        trackSpeculationLine(ch);
      }
    }
    processCharacter(ch, records);
  };

  return {
    push(text) {
      const records = [];
      for (const ch of String(text == null ? "" : text)) feed(ch, records);
      return records;
    },
    finish() {
      const records = [];
      while (speculationContradictsHeaderAtEof()) rollbackSpeculation(records);
      // 围栏或 JSON 候选一直到文件结束都没闭合时，回滚为标准 CSV，
      // 同时保留诊断，让调用方提示源内容可能被截断。
      if (specMode === "fence" && codeFence) rollbackSpeculation(records);
      if (structurePendingQuote) {
        // 文件在开括号后的引号处结束，那个引号是收尾引号
        structurePendingQuote = false;
        structurePendingOpen = "";
        inQuotes = false;
        endSpeculation();
      }
      const unclosedStructuredField = specMode === "structure" && (
        structureStack.length > 0 || Boolean(structurePendingOpen)
      );
      if (unclosedStructuredField) rollbackSpeculation(records);
      diagnostics = {
        unclosedQuotedField: inQuotes && !pendingQuote && !pendingEscapedQuote,
        unclosedStructuredField,
        unclosedCodeFence: codeFence,
      };
      if (pendingEscapedQuote) {
        field += "\\";
        started = true;
        inQuotes = false;
        pendingEscapedQuote = false;
      }
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

  candidates.forEach((delimiter, priority) => {
    const parser = createCsvRecordParser(delimiter);
    const records = parser.push(sample).filter((record) => record.some((cell) => cell !== "")).slice(0, 20);
    const counts = records.map((record) => Math.max(0, record.length - 1));
    const nonZero = counts.filter((count) => count > 0);
    if (!nonZero.length) return;
    const average = nonZero.reduce((sum, count) => sum + count, 0) / nonZero.length;
    const variance = nonZero.reduce((sum, count) => sum + Math.abs(count - average), 0) / nonZero.length;
    const consistency = nonZero.length / Math.max(1, records.length);
    // 真正的分隔符会让数据行的列数稳定复现表头列数；
    // 只是恰好出现在某个单元格里的字符（tags 列的 a|b|c）做不到这一点。
    const headerColumns = records[0] ? records[0].length : 0;
    const dataRecords = records.slice(1);
    const headerMatch = dataRecords.length
      ? dataRecords.filter((record) => record.length === headerColumns).length / dataRecords.length
      : 1;
    const score = average * 4 + consistency * 8 + headerMatch * 12 - variance * 3 - priority * 0.5;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  });

  return best;
}
