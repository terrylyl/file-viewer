import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// RFC 4180 一致性语料。目的有两个：
// 1. 把标准 CSV 的解析结果钉死，避免为了兼容宽松输入（未加引号的 JSON、
//    Markdown 围栏、反斜杠转义）而调整状态机时，悄悄改坏了合规文件；
// 2. 让小文件路径（csv-worker 的 parseCsvText）和大文件路径
//    （large-data-worker 的字节偏移索引）跑同一份语料。这两条路径是各自
//    独立的解析实现，一致性只能靠对拍守住。
//
// 条目里的 section 对应 RFC 4180 第 2 节的条款编号，方便定位争议。

function loadCsvCore() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="csv-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed csv-worker-source");
  const context = { console, TextDecoder, self: { postMessage() {}, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  assert.ok(context.self.__CSV_CORE__, "worker should expose testable core");
  return context.self.__CSV_CORE__;
}

function loadLargeWorker() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="large-data-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed large-data-worker-source");
  const messages = [];
  const context = {
    Blob,
    TextDecoder,
    Uint8Array,
    Uint32Array,
    self: { postMessage(message) { messages.push(message); } },
  };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return { context, messages };
}

// 大文件路径只接受真实的 File：按给定的 chunk 尺寸循环切流，用来把记录边界、
// 引号状态和多字节字符都压在 chunk 交界上。
function createByteFile(bytes, chunkSizes, name = "rfc4180.csv") {
  return {
    name,
    size: bytes.byteLength,
    lastModified: 0,
    slice(start, end) { return new Blob([bytes.slice(start, end)]); },
    stream() {
      let offset = 0;
      let chunkIndex = 0;
      return new ReadableStream({
        pull(controller) {
          if (offset >= bytes.length) { controller.close(); return; }
          const size = chunkSizes[chunkIndex % chunkSizes.length];
          controller.enqueue(bytes.slice(offset, offset + size));
          offset += size;
          chunkIndex += 1;
        },
      });
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const CORPUS = [
  // ---- §2.1 记录以 CRLF 分隔 ----
  { name: "CRLF 分隔记录", section: "2.1", input: "a,b\r\n1,2\r\n3,4", headers: ["a", "b"], rows: [["1", "2"], ["3", "4"]] },
  // RFC 只认 CRLF，LF / 单 CR 属于我们主动放宽的部分，结果必须与 CRLF 一致
  { name: "LF 分隔记录(宽松扩展)", section: "2.1", input: "a,b\n1,2\n3,4", headers: ["a", "b"], rows: [["1", "2"], ["3", "4"]] },
  { name: "单 CR 分隔记录(宽松扩展)", section: "2.1", input: "a,b\r1,2", headers: ["a", "b"], rows: [["1", "2"]] },

  // ---- §2.2 末记录可以没有结尾换行；有结尾换行也不能多出空记录 ----
  { name: "末记录无换行", section: "2.2", input: "a,b\r\n1,2", headers: ["a", "b"], rows: [["1", "2"]] },
  { name: "结尾 CRLF 不产生空行", section: "2.2", input: "a,b\r\n1,2\r\n", headers: ["a", "b"], rows: [["1", "2"]] },
  { name: "结尾 LF 不产生空行", section: "2.2", input: "a,b\n1,2\n", headers: ["a", "b"], rows: [["1", "2"]] },

  // ---- §2.3 表头行 ----
  { name: "只有表头", section: "2.3", input: "a,b,c", headers: ["a", "b", "c"], rows: [] },
  { name: "表头整体加引号", section: "2.3", input: '"a","b"\r\n1,2', headers: ["a", "b"], rows: [["1", "2"]] },

  // ---- §2.4 逗号分隔；空格属于字段内容 ----
  { name: "空字段", section: "2.4", input: "a,b,c\r\n1,,3", headers: ["a", "b", "c"], rows: [["1", "", "3"]] },
  { name: "末字段为空", section: "2.4", input: "a,b\r\n1,", headers: ["a", "b"], rows: [["1", ""]] },
  { name: "字段内空格保留", section: "2.4", input: "a,b\r\n foo , bar ", headers: ["a", "b"], rows: [[" foo ", " bar "]] },
  // 引号外带空格时整个字段不再是 quoted field，引号按普通字符原样保留
  { name: "引号外有空格时不视为引号字段", section: "2.4", input: 'a,b\r\n "x" ,2', headers: ["a", "b"], rows: [[' "x" ', "2"]] },

  // ---- §2.5 字段可以加引号 ----
  { name: "引号包裹的空字段", section: "2.5", input: 'a,b,c\r\n1,"",3', headers: ["a", "b", "c"], rows: [["1", "", "3"]] },
  { name: "末字段为引号空串", section: "2.5", input: 'a,b\r\n1,""', headers: ["a", "b"], rows: [["1", ""]] },

  // ---- §2.6 含逗号 / CRLF / 引号的字段必须加引号 ----
  { name: "引号内的逗号", section: "2.6", input: 'a,b\r\n"x,y",2', headers: ["a", "b"], rows: [["x,y", "2"]] },
  { name: "整个字段只是一个逗号", section: "2.6", input: 'a,b\r\n",",2', headers: ["a", "b"], rows: [[",", "2"]] },
  { name: "引号内的 CRLF 原样保留", section: "2.6", input: 'a,b\r\n"line1\r\nline2",2', headers: ["a", "b"], rows: [["line1\r\nline2", "2"]] },
  { name: "引号内跨多行", section: "2.6", input: 'a,b\r\n"l1\r\nl2\r\nl3",2', headers: ["a", "b"], rows: [["l1\r\nl2\r\nl3", "2"]] },

  // ---- §2.7 引号内的引号双写转义 ----
  { name: "双写引号转义", section: "2.7", input: 'a,b\r\n"say ""hi""",2', headers: ["a", "b"], rows: [['say "hi"', "2"]] },
  { name: "字段内容只有一个引号", section: "2.7", input: 'a,b\r\n"""",2', headers: ["a", "b"], rows: [['"', "2"]] },
  { name: "逗号+双写引号+CRLF 混合", section: "2.6/2.7", input: 'a,b\r\n"x,""y""\r\nz",2', headers: ["a", "b"], rows: [['x,"y"\r\nz', "2"]] },

  // ---- 非 ASCII：多字节字符不能在任何环节被拆坏 ----
  { name: "多字节字段", section: "2.4", input: '名前,説明\r\n田中,"こんにちは、世界"', headers: ["名前", "説明"], rows: [["田中", "こんにちは、世界"]] },
];

function parseSmall(core, input) {
  const parsed = core.parseCsvText(input, { delimiter: "," });
  return { headers: plain(parsed.headers), rows: plain(parsed.rows), issues: parsed.issues };
}

async function parseLarge(input, chunkSizes) {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createByteFile(new TextEncoder().encode(input), chunkSizes),
    fileKind: "CSV",
    encoding: "auto",
  } });
  const loaded = messages.find((message) => message.type === "loaded");
  assert.ok(loaded, "large data worker should report loaded");
  const rowCount = loaded.result.rowCount;
  if (!rowCount) return { headers: plain(loaded.result.headers), rows: [] };
  await context.self.onmessage({ data: {
    kind: "get-rows",
    token: 1,
    indices: Array.from({ length: rowCount }, (_, index) => index),
  } });
  const rows = messages.find((message) => message.type === "rows");
  assert.ok(rows, "large data worker should return requested rows");
  return { headers: plain(loaded.result.headers), rows: plain(rows.rows).map((entry) => entry.row) };
}

test("RFC 4180 语料：小文件路径", () => {
  const core = loadCsvCore();
  const failures = [];

  for (const entry of CORPUS) {
    const actual = parseSmall(core, entry.input);
    try {
      assert.deepEqual(actual.headers, entry.headers);
      assert.deepEqual(actual.rows, entry.rows);
    } catch {
      failures.push(
        `[§${entry.section}] ${entry.name}: 实得 ${JSON.stringify(actual.headers)} / ${JSON.stringify(actual.rows)}，` +
        `期望 ${JSON.stringify(entry.headers)} / ${JSON.stringify(entry.rows)}`,
      );
    }
  }

  assert.deepEqual(failures, [], `RFC 4180 一致性回归：\n${failures.join("\n")}`);
});

test("RFC 4180 语料：合规输入不产生解析告警", () => {
  const core = loadCsvCore();
  const noisy = [];

  for (const entry of CORPUS) {
    const { issues } = parseSmall(core, entry.input);
    const reported = [
      ...issues.inconsistentRows.map((issue) => issue.type),
      ...issues.duplicateColumns.map((issue) => issue.type),
    ];
    if (reported.length) noisy.push(`[§${entry.section}] ${entry.name}: ${JSON.stringify(reported)}`);
  }

  assert.deepEqual(noisy, [], `合规 CSV 不应报问题：\n${noisy.join("\n")}`);
});

// 大文件路径（≥24 MiB）走的是另一套字节级解析器。用同一份语料 + 极端切块，
// 把记录边界、引号状态、多字节字符全部压在 chunk 交界上。
for (const chunkSizes of [[1], [3, 5, 1, 7]]) {
  const label = chunkSizes.length === 1 && chunkSizes[0] === 1 ? "逐字节切流" : "不等长切流";

  test(`RFC 4180 语料：大文件路径（${label}）与小文件路径一致`, async () => {
    const core = loadCsvCore();
    const failures = [];

    for (const entry of CORPUS) {
      const large = await parseLarge(entry.input, chunkSizes);
      const small = parseSmall(core, entry.input);
      try {
        // 先对标准，再对拍：两条路径同时跑偏时也能发现
        assert.deepEqual(large.headers, entry.headers);
        assert.deepEqual(large.rows, entry.rows);
        assert.deepEqual(large.headers, small.headers);
        assert.deepEqual(large.rows, small.rows);
      } catch {
        failures.push(
          `[§${entry.section}] ${entry.name}: 大文件路径 ${JSON.stringify(large.headers)} / ${JSON.stringify(large.rows)}，` +
          `小文件路径 ${JSON.stringify(small.headers)} / ${JSON.stringify(small.rows)}，` +
          `期望 ${JSON.stringify(entry.headers)} / ${JSON.stringify(entry.rows)}`,
        );
      }
    }

    assert.deepEqual(failures, [], `两条解析路径不一致：\n${failures.join("\n")}`);
  });
}

test("RFC 4180 引号规则在非逗号分隔符下同样成立", () => {
  const core = loadCsvCore();

  for (const delimiter of [";", "\t", "|"]) {
    const input = [
      `a${delimiter}b`,
      `"x${delimiter}y"${delimiter}2`,
      `"say ""hi"""${delimiter}3`,
      `"l1\r\nl2"${delimiter}4`,
    ].join("\r\n");
    const parsed = core.parseCsvText(input, { delimiter });
    const label = JSON.stringify(delimiter);

    assert.equal(core.detectDelimiter(input), delimiter, `${label} 应被探测到`);
    assert.deepEqual(plain(parsed.headers), ["a", "b"], label);
    assert.deepEqual(plain(parsed.rows), [
      [`x${delimiter}y`, "2"],
      ['say "hi"', "3"],
      ["l1\r\nl2", "4"],
    ], label);
  }
});

test("UTF-8 BOM 被剥离且不污染首列列名", () => {
  const core = loadCsvCore();
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a,b\r\n1,2")]);
  const decoded = core.decodeBuffer(bytes.buffer, "auto");

  assert.equal(decoded.text, "a,b\r\n1,2");
  const parsed = core.parseCsvText(decoded.text, { delimiter: "," });
  assert.deepEqual(plain(parsed.headers), ["a", "b"]);
  assert.deepEqual(plain(parsed.rows), [["1", "2"]]);
});

// 以下是与 RFC 4180 的已知偏差，全部是刻意的宽松处理。写在这里是为了让偏差
// 变成显式约定：将来谁改动了这些行为，测试会红，而不是悄无声息地变。
test("已知偏差：全空记录被丢弃，不作为数据行", () => {
  const core = loadCsvCore();
  // 严格按 RFC，",," 是一条含 3 个空字段的合法记录；这里丢弃它，是因为
  // 前导空行 / Excel 的 ",," 占位行不能顶替表头（见 parseCsvText 的取样口径）。
  const parsed = core.parseCsvText("a,b,c\r\n,,", { delimiter: "," });

  assert.deepEqual(plain(parsed.headers), ["a", "b", "c"]);
  assert.deepEqual(plain(parsed.rows), []);
});

test("已知偏差：列数不一致时补齐或扩表头，并报告问题", () => {
  const core = loadCsvCore();

  // 少列：补空到表头列数
  const short = core.parseCsvText("a,b,c\r\n1,2", { delimiter: "," });
  assert.deepEqual(plain(short.rows), [["1", "2", ""]]);
  assert.ok(
    short.issues.inconsistentRows.some((issue) => issue.type === "列数不一致"),
    "少列必须报「列数不一致」",
  );

  // 多列：补出 Column N 占位表头，数据不丢
  const long = core.parseCsvText("a,b,c\r\n1,2,3,4", { delimiter: "," });
  assert.deepEqual(plain(long.headers), ["a", "b", "c", "Column 4"]);
  assert.deepEqual(plain(long.rows), [["1", "2", "3", "4"]]);
  assert.ok(
    long.issues.inconsistentRows.some((issue) => issue.type === "列数不一致"),
    "多列必须报「列数不一致」",
  );
});

test("已知偏差：引号未闭合时兜底解析并报告问题", () => {
  const core = loadCsvCore();
  // RFC 未定义未闭合引号的行为。我们不整块吞掉剩余内容，而是兜底切分并告警。
  const parsed = core.parseCsvText('a,b\r\n"x,2', { delimiter: "," });

  assert.ok(
    parsed.issues.inconsistentRows.some((issue) => issue.type === "复杂字段未闭合"),
    "未闭合引号必须报「复杂字段未闭合」",
  );
});
