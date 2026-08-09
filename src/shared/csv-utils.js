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
  let sawUndoubledQuote = false;
  let diagnostics = { unclosedQuotedField: false, unclosedStructuredField: false, unclosedCodeFence: false, undoubledQuote: false };

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
    // 行尾停在分隔符上的行，最后一个字段是空的——那更像跨行 JSON 的续行
    // （`"a": 1,`），不是一条自成一体的记录。首行已有这条保护，后续行同样需要。
    const contradicts = specPhysicalLineIndex > 0
      && specFirstLineMatchesHeader
      && matchesHeader
      && !specLineLastSignificantIsDelimiter;
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
    // 引号内的括号配平了就够：双重编码的 JSON（`\"` 转义、字面 `\n`）
    // 本身过不了 JSON.parse，但它被引号定界，误判的代价远小于把它切碎。
    const accept = validJson || specInQuotes;
    if (!accept || !learnedColumns) {
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
      // 换行也是 JSON 里的合法缩进：`[\n  "a"]` 是标准的 pretty-print，
      // 只认空格和 Tab 会把它挡在结构化模式外面，然后按换行切成好几行。
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
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
      // 引号内的开括号放宽前瞻：字段边界本来就由引号定界，`[2024上半年`
      // 吞掉整个文件那个风险是未加引号场景独有的。而被 JSON 转义过的内容
      // （`[\n\t\t\t\"名字\"` 这种双重编码）开头就是反斜杠，卡在白名单上
      // 就会丢掉保护，然后在第一个 `",` 处被当成字段收尾。
      if (specInQuotes || isJsonStructureLead(open, ch)) {
        structureStack = [open];
        structureInString = false;
        structureEscaped = false;
        processCharacter(ch, records);
        return;
      }
      // 前瞻不通过就回滚重放：等待期间可能已经吞掉了换行，
      // 直接 endSpeculation 会把记录边界一起吃掉，把两行粘成一行。
      rollbackSpeculation(records);
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
      // 引号后面既不是引号也不是分隔符/换行：这是引号内一个没有双写的 `"`。
      // 它本身还能兜住，但同一份文件里只要有一个 `"` 后面恰好跟着分隔符，
      // 字段就会在那里提前收尾、整行错位——记下来给用户一条明确的线索。
      sawUndoubledQuote = true;
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
        undoubledQuote: sawUndoubledQuote,
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

// 引号内出现未双写的 `"`，同时又真的切出了列数不一致的行——这两件事凑齐，
// 基本可以断定是生成端没有把内部 `"` 转义成 `""`，而不是本地解析出了问题。
const CSV_UNDOUBLED_QUOTE_ISSUE = "疑似引号未双写";
const CSV_UNDOUBLED_QUOTE_DETAIL = "字段内出现了没有双写的 \"，CSV 会在其中一个 \" 后面遇到分隔符时提前收尾，导致整行错位。请在生成 CSV 时把字段内部的每个 \" 写成 \"\"。";

function describeCsvParserDiagnostics(diagnostics) {
  const problems = [];
  if (diagnostics?.unclosedQuotedField) problems.push("CSV 双引号");
  if (diagnostics?.unclosedStructuredField) problems.push("JSON/数组括号");
  if (diagnostics?.unclosedCodeFence) problems.push("Markdown 代码块");
  return problems.length ? `复杂字段未闭合：${problems.join("、")}。后续内容已保留在同一单元格，请检查源 CSV。` : "";
}

const CSV_DELIMITER_CANDIDATES = [",", "\t", ";", "|"];
const CSV_DELIMITER_SAMPLE_MAX_CHARS = 256 * 1024;

function describeCsvDelimiter(delimiter) {
  if (delimiter === "\t") return "Tab";
  if (delimiter === ",") return "逗号";
  if (delimiter === ";") return "分号";
  if (delimiter === "|") return "竖线";
  return delimiter || "";
}

// options.truncated：调用方给的 text 本身就是截断样本（大文件只读前 512 KiB）。
// 只有样本覆盖完整输入时才能 finish()，否则会把半条记录当成完整证据。
function sampleCsvRecords(text, delimiter, options = {}) {
  const source = String(text == null ? "" : text);
  const sample = source.slice(0, CSV_DELIMITER_SAMPLE_MAX_CHARS);
  const complete = !options.truncated && sample.length === source.length;
  const parser = createCsvRecordParser(delimiter);
  const records = parser.push(sample);
  if (complete) {
    for (const record of parser.finish()) records.push(record);
  }
  return records.filter((record) => record.some((cell) => cell !== "")).slice(0, 20);
}

// 表头不一定是第一条记录：标题行、导出说明、`#` 注释都可能排在前面。
// 但"能跳过表头行"这件事本身很危险——tags 列（a|b|c）和正文里的 Markdown
// 表格都能靠跳过表头凑出漂亮的列结构。所以跳过分两种：
//   其它候选也切不开的行 = 真前言，免费跳；
//   其它候选能切开的行 = 它可能才是真表头，跳它要付代价。
// 代价要够大：`id,note` + `1,a;b;c;d;e` 这类 tags 列，跳过表头后能凑出
// 稳定的 5 列结构（≈34 分），必须压到真分隔符（≈24 分）以下；
// 又要够小：`报表：1月,2月` 后面才是分号表时，分号跳一行仍要能赢（≈27 分对逗号 6 分）。
const CSV_DELIMITER_MAX_HEADER_SKIP = 3;
const CSV_DELIMITER_SKIP_PENALTY = 16;
// `| a | b |` 这类用法是给内容"包边"而不是分隔：每条记录的首尾字段同时为空。
// 它在正文里出现得再密集也不能赢过真正的分隔符。
const CSV_DELIMITER_DECORATION_PENALTY = 40;
// 切得更宽只在小范围内算证据。不封顶的话，一张 60 列的 Markdown 表能靠宽度
// 压过 38 列的真表头，宽度项会盖掉一致性、表头复现和包边惩罚。
const CSV_DELIMITER_WIDTH_CAP = 12;
// 方差罚同样要封顶。方差的单位是"分隔符个数"，几条被宽容解析切坏的记录
// （JSON / HTML / 围栏列很容易触发）就能到几百，把 headerMatch、consistency
// 这些有界的稳健指标整个盖掉：17/19 行都完美复现表头的逗号会被打到 -246，
// 输给文件里几乎不存在、因此"很稳定"的分号，整表随后塌成一列。
const CSV_DELIMITER_VARIANCE_CAP = 4;

function isCsvPreambleLine(line, delimiter) {
  return !CSV_DELIMITER_CANDIDATES.some((other) => other !== delimiter && line.includes(other));
}

function scoreCsvDelimiterCandidate(records, headerIndex, priority) {
  const scoped = records.slice(headerIndex);
  const headerColumns = scoped[0] ? scoped[0].length : 0;
  if (headerColumns < 2) return null;
  const counts = scoped.map((record) => Math.max(0, record.length - 1));
  const nonZero = counts.filter((count) => count > 0);
  if (!nonZero.length) return null;
  const average = nonZero.reduce((sum, count) => sum + count, 0) / nonZero.length;
  const variance = nonZero.reduce((sum, count) => sum + Math.abs(count - average), 0) / nonZero.length;
  const consistency = nonZero.length / Math.max(1, scoped.length);
  // 真正的分隔符会让数据行的列数稳定复现表头列数；
  // 只是恰好出现在某个单元格里的字符（tags 列的 a|b|c）做不到这一点。
  const dataRecords = scoped.slice(1);
  const headerMatch = dataRecords.length
    ? dataRecords.filter((record) => record.length === headerColumns).length / dataRecords.length
    : 1;
  const decorated = scoped.filter((record) => (
    record.length > 2 && record[0].trim() === "" && record[record.length - 1].trim() === ""
  )).length / scoped.length;
  return Math.min(average, CSV_DELIMITER_WIDTH_CAP) * 4 + consistency * 8 + headerMatch * 12
    - Math.min(variance, CSV_DELIMITER_VARIANCE_CAP) * 3
    - priority * 0.5
    - decorated * CSV_DELIMITER_DECORATION_PENALTY;
}

function detectCsvDelimiter(text, options = {}) {
  let best = ",";
  let bestScore = -Infinity;

  CSV_DELIMITER_CANDIDATES.forEach((delimiter, priority) => {
    const records = sampleCsvRecords(text, delimiter, options);
    const maxSkip = Math.min(CSV_DELIMITER_MAX_HEADER_SKIP, Math.max(0, records.length - 1));
    let skipCost = 0;
    for (let headerIndex = 0; headerIndex <= maxSkip; headerIndex += 1) {
      if (headerIndex > 0) {
        const skipped = records[headerIndex - 1];
        const free = skipped.length === 1 && isCsvPreambleLine(skipped[0], delimiter);
        skipCost += free ? 0 : CSV_DELIMITER_SKIP_PENALTY;
      }
      const score = scoreCsvDelimiterCandidate(records, headerIndex, priority);
      if (score == null) continue;
      if (score - skipCost > bestScore) {
        best = delimiter;
        bestScore = score - skipCost;
      }
    }
  });

  return best;
}

// 表头不一定是第一条记录。标题行、导出说明、`#` 注释都只有一个单元格，
// 切不出表格主体的常见宽度。只跳这种单格行，最多 3 行：
// 「表头比数据行窄」是合法的（行尾多一个分隔符就会这样），不能一起跳。
const CSV_MAX_PREAMBLE_RECORDS = 3;

function findCsvHeaderIndex(records) {
  if (!records.length) return 0;
  const tally = new Map();
  for (const record of records.slice(0, 20)) tally.set(record.length, (tally.get(record.length) || 0) + 1);
  let modal = 0;
  let hits = 0;
  for (const [width, seen] of tally) {
    if (seen > hits || (seen === hits && width > modal)) {
      modal = width;
      hits = seen;
    }
  }
  if (modal < 2) return 0;
  let index = 0;
  while (
    index < records.length - 1
    && index < CSV_MAX_PREAMBLE_RECORDS
    && records[index].length === 1
  ) index += 1;
  // 跳到上限还是单格行，说明前言比允许的更长：与其把说明文字当表头，
  // 不如退回原样，由「分隔符可能判断有误」「列数不一致」去提示。
  return records[index] && records[index].length > 1 ? index : 0;
}

// 只在整表塌成一列时调用：这时另一个候选如果能把多数记录切成同样的宽度，
// 基本可以断定分隔符判错了。用众数而不是首条记录，前言行才不会挡住判断。
function findCsvDelimiterAlternative(text, chosen, options = {}) {
  let best = null;

  for (const delimiter of CSV_DELIMITER_CANDIDATES) {
    if (delimiter === chosen) continue;
    const sampled = sampleCsvRecords(text, delimiter, options);
    // 前言行同样会稀释覆盖率，这里和探测一样先跳掉开头切不开的记录
    let start = 0;
    while (start < sampled.length && sampled[start].length < 2) start += 1;
    const records = sampled.slice(start);
    if (records.length < 2) continue;
    const tally = new Map();
    for (const record of records) {
      if (record.length < 2) continue;
      tally.set(record.length, (tally.get(record.length) || 0) + 1);
    }
    let columns = 0;
    let hits = 0;
    for (const [count, seen] of tally) {
      if (seen > hits || (seen === hits && count > columns)) {
        columns = count;
        hits = seen;
      }
    }
    if (!columns) continue;
    const coverage = hits / records.length;
    if (coverage < 0.6) continue;
    if (!best || coverage > best.coverage || (coverage === best.coverage && columns > best.columns)) {
      best = { delimiter, columns, coverage };
    }
  }

  return best;
}
