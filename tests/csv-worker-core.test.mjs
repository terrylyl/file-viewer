import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function loadWorkerCore() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(
    /<script id="csv-worker-source" type="text\/plain">([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "index.html should embed csv-worker-source");

  const context = {
    console,
    TextDecoder,
    self: {
      postMessage() {},
      addEventListener() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  assert.ok(context.self.__CSV_CORE__, "worker should expose testable core");
  return context.self.__CSV_CORE__;
}

test("detectDelimiter chooses the most consistent delimiter", () => {
  const core = loadWorkerCore();

  assert.equal(core.detectDelimiter("a,b,c\n1,2,3\n4,5,6"), ",");
  assert.equal(core.detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(core.detectDelimiter("a|b|c\n1|2|3"), "|");
  assert.equal(core.detectDelimiter("a;b;c\n1;2;3"), ";");
});

test("parseCsvText handles quoted commas and quoted newlines", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText(
    'name,notes\n"Alice","hello, world"\n"Bob","line 1\nline 2"',
    { delimiter: ",", previewLimit: 300 },
  );

  assert.equal(JSON.stringify(parsed.headers), JSON.stringify(["name", "notes"]));
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], "hello, world");
  assert.equal(parsed.rows[1][1], "line 1\nline 2");
  assert.equal(parsed.meta.rowCount, 2);
  assert.equal(parsed.meta.columnCount, 2);
});

test("parseCsvText preserves relaxed JSON fields without splitting their commas", () => {
  const core = loadWorkerCore();
  const input = [
    "id,name,payload,notes",
    '1,Alice,{"tags":["a","b"],"nested":{"ok":true}},plain',
    '2,Bob,"{"tags":["c","d"],"nested":{"ok":false}}",next',
  ].join("\n");
  const parsed = core.parseCsvText(input);

  assert.equal(core.detectDelimiter(input), ",");
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][2], '{"tags":["a","b"],"nested":{"ok":true}}');
  assert.equal(parsed.rows[1][2], '{"tags":["c","d"],"nested":{"ok":false}}');
  assert.equal(parsed.issues.inconsistentRows.length, 0);
});

test("parseCsvText keeps backslash-escaped separators and fenced Markdown in one field", () => {
  const core = loadWorkerCore();
  const input = [
    "id,name,payload,notes",
    "1,Alice,alpha\\, beta,```json",
    '{"text":"one, two","items":[1,2]}',
    "```",
    "2,Bob,plain,after",
  ].join("\n");
  const parsed = core.parseCsvText(input, { delimiter: "," });

  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][2], "alpha\\, beta");
  assert.equal(parsed.rows[0][3], '```json\n{"text":"one, two","items":[1,2]}\n```');
  assert.equal(parsed.rows[1][3], "after");
  assert.equal(parsed.issues.inconsistentRows.length, 0);
});

test("complex 10-by-5 CSV fixture preserves every logical record and column", () => {
  const core = loadWorkerCore();
  const input = readFileSync(
    new URL("./fixtures/complex-csv-boundaries-10x5.csv", import.meta.url),
    "utf8",
  );
  const parsed = core.parseCsvText(input, { delimiter: ",", previewLimit: 300 });

  assert.equal(parsed.rows.length, 10);
  assert.equal(parsed.headers.length, 5);
  assert.equal(parsed.meta.rowCount, 10);
  assert.equal(parsed.meta.columnCount, 5);
  assert.equal(parsed.rows[2][2], '{"message":"first line\nsecond line","count":2}');
  assert.equal(parsed.rows[3][2], '{"tags":["a","b"],"nested":{"enabled":true,"count":2}}');
  assert.equal(parsed.rows[4][2], '{"tags":["c","d"],"nested":{"enabled":false}}');
  assert.equal(parsed.rows[5][2], "alpha\\, beta");
  assert.equal(parsed.rows[5][3], "C:\\\\temp\\\\demo");
  assert.equal(parsed.rows[6][3], '```json\n{"text":"one, two","nested":{"ok":true}}\n```');
  assert.equal(parsed.rows[8][2], "");
  assert.equal(parsed.rows[8][3], "");
  assert.equal(parsed.issues.inconsistentRows.length, 0);
});

test("streaming parser keeps escaped CSV quotes intact across chunk boundaries", () => {
  const core = loadWorkerCore();
  const parser = core.createCsvRecordParser(",");
  const records = [];
  for (const chunk of ['id,payload\n1,"{"', '"key""', ':""one,two""}"\n']) {
    records.push(...parser.push(chunk));
  }
  records.push(...parser.finish());

  assert.equal(JSON.stringify(records), JSON.stringify([
    ["id", "payload"],
    ["1", '{"key":"one,two"}'],
  ]));
});

test("parseCsvText warns instead of silently splitting an unclosed complex field", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText('id,payload,notes\n1,{"tags":["a","b"],unfinished');

  assert.equal(parsed.rows.length, 1);
  const warning = parsed.issues.inconsistentRows.find((issue) => issue.type === "复杂字段未闭合");
  assert.ok(warning, "unclosed structured content should remain visible as an import warning");
  assert.match(warning.detail, /JSON\/数组括号/);
});

test("parseCsvText repairs unescaped formula delimiters without adding columns", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText(
    "id,formula,result\n1,=IF(A1 > 0, B1, C1),ok\n2,=ROUND(SUM(A2, B2), 2),done",
    { delimiter: ",", previewLimit: 300 },
  );

  assert.equal(JSON.stringify(parsed.headers), JSON.stringify(["id", "formula", "result"]));
  assert.equal(parsed.meta.columnCount, 3);
  assert.equal(parsed.rows[0][1], "=IF(A1 > 0, B1, C1)");
  assert.equal(parsed.rows[0][2], "ok");
  assert.equal(parsed.rows[1][1], "=ROUND(SUM(A2, B2), 2)");
  assert.equal(parsed.rows[1][2], "done");
});

test("parseCsvText handles more rows than the JavaScript argument limit", () => {
  const core = loadWorkerCore();
  const rowCount = 200_000;
  const text = `id\n${Array.from({ length: rowCount }, (_, index) => String(index + 1)).join("\n")}`;

  const parsed = core.parseCsvText(text, { delimiter: ",", previewLimit: 100 });

  assert.equal(parsed.rows.length, rowCount);
  assert.equal(parsed.rows[0][0], "1");
  assert.equal(parsed.rows[rowCount - 1][0], String(rowCount));
  assert.equal(parsed.meta.rowCount, rowCount);
  assert.equal(parsed.meta.columnCount, 1);
});

test("parseCsvText reports inconsistent rows and long fields", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText(
    `a,b,c\n1,2,3\n4,5\n6,${"x".repeat(520)},8`,
    { delimiter: ",", previewLimit: 300, longFieldThreshold: 500 },
  );

  assert.equal(parsed.issues.inconsistentRows.length, 1);
  assert.equal(parsed.issues.inconsistentRows[0].rowNumber, 3);
  assert.equal(parsed.issues.longFields.length, 1);
  assert.equal(parsed.issues.longFields[0].rowNumber, 4);
  assert.equal(parsed.issues.longFields[0].columnName, "b");
});

test("parseCsvText reports duplicate source column names", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("id,name,name\n1,Alice,QA\n2,Bob,Dev", {
    delimiter: ",",
    previewLimit: 500,
  });

  assert.equal(parsed.issues.duplicateColumns.length, 1);
  assert.equal(parsed.issues.duplicateColumns[0].columnName, "name");
  assert.equal(JSON.stringify(parsed.issues.duplicateColumns[0].columnIndexes), JSON.stringify([1, 2]));
});

test("parseJsonlText expands object keys into table columns", () => {
  const core = loadWorkerCore();
  const parsed = core.parseJsonlText(
    [
      '{"id":1,"name":"Alice","meta":{"score":3}}',
      '{"id":2,"active":true,"tags":["x","y"],"name":null}',
      "",
      '{"id":3,"name":"Cara"}',
    ].join("\n"),
    { longFieldThreshold: 1000 },
  );

  assert.equal(JSON.stringify(parsed.headers), JSON.stringify(["id", "name", "meta", "active", "tags"]));
  assert.equal(JSON.stringify(parsed.rows[0]), JSON.stringify(["1", "Alice", '{"score":3}', "", ""]));
  assert.equal(JSON.stringify(parsed.rows[1]), JSON.stringify(["2", "", "", "true", '["x","y"]']));
  assert.equal(JSON.stringify(parsed.rows[2]), JSON.stringify(["3", "Cara", "", "", ""]));
  assert.equal(parsed.meta.rowCount, 3);
  assert.equal(parsed.meta.columnCount, 5);
  assert.equal(parsed.meta.delimiter, "JSON Lines");
});

test("parseJsonlText reports malformed and non-object lines", () => {
  const core = loadWorkerCore();

  assert.throws(
    () => core.parseJsonlText('{"id":1}\nnot-json'),
    /第 2 行 JSON 解析失败/,
  );
  assert.throws(
    () => core.parseJsonlText('{"id":1}\n[1,2,3]'),
    /第 2 行不是 JSON object/,
  );
});

test("a bracket that is not JSON never swallows the rest of the file", () => {
  const core = loadWorkerCore();

  for (const input of [
    "name,note\nalice,[TODO\nbob,ok\ncarol,fine",
    'name,note\nalice,"[TODO"\nbob,ok\ncarol,fine',
    "name,note\nalice,{草稿\nbob,ok\ncarol,fine",
  ]) {
    const parsed = core.parseCsvText(input, { delimiter: "," });
    assert.equal(parsed.rows.length, 3, `should keep every row for ${JSON.stringify(input)}`);
    assert.equal(parsed.rows[1][1], "ok");
    assert.equal(parsed.rows[2][1], "fine");
  }
});

test("an unclosed Markdown fence falls back to plain CSV instead of eating later rows", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("name,note\na,```\nb,ok\nc,fine", { delimiter: "," });

  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0][1], "```");
  assert.equal(parsed.rows[1][1], "ok");
  assert.equal(parsed.rows[2][1], "fine");
});

test("a quoted field ending in a backslash closes at its own quote", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText('path,next\n"C:\\data\\",2024\nb,3', { delimiter: "," });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][0], "C:\\data\\");
  assert.equal(parsed.rows[0][1], "2024");
  assert.equal(parsed.rows[1][0], "b");
});

test("an unquoted trailing backslash does not merge two columns", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("path,next\nC:\\data\\,2024\nb,3", { delimiter: "," });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][0], "C:\\data\\");
  assert.equal(parsed.rows[0][1], "2024");
  assert.equal(parsed.issues.inconsistentRows.length, 0);
});

test("exported CSV survives a round trip through the parser", () => {
  const core = loadWorkerCore();
  const rows = [
    ["id", "value"],
    ["1", "[draft"],
    ["2", "C:\\data\\"],
    ["3", "-5"],
    ["4", "```"],
    ["5", "{"],
    ["6", 'say "hi", ok'],
    ["7", "line1\nline2"],
  ];
  const csv = rows.map((row) => row.map(core.escapeCsv).join(",")).join("\r\n");
  const parsed = core.parseCsvText(csv, { delimiter: "," });

  assert.equal(parsed.rows.length, rows.length - 1);
  for (let index = 1; index < rows.length; index += 1) {
    // 解析结果来自 vm 上下文，数组原型不同，按现有测试惯例用 JSON 比较
    assert.equal(
      JSON.stringify(parsed.rows[index - 1]),
      JSON.stringify(rows[index]),
      `row ${index} should round trip unchanged`,
    );
  }
});

test("a JSON-looking field that never closes gives up after the tolerance budget", () => {
  const core = loadWorkerCore();
  // `[{` 能通过 JSON 前瞻，但永不闭合；超过字符预算后必须回滚，不能吞掉后面所有行
  const filler = "row,data\n".repeat(150_000);
  const parsed = core.parseCsvText(`id,note\n1,[{${filler}`, { delimiter: "," });

  assert.ok(parsed.rows.length > 100_000, `expected the later rows back, got ${parsed.rows.length}`);
  // 回滚后首条记录多切出一列，因此所有行按 maxColumns 补齐，这里只校验实际内容
  const lastRow = parsed.rows.at(-1);
  assert.equal(lastRow[0], "row");
  assert.equal(lastRow[1], "data");
});

test("detectDelimiter ignores separator-like characters inside a single column", () => {
  const core = loadWorkerCore();

  assert.equal(core.detectDelimiter("id,tags\n1,a|b|c|d\n2,e|f|g|h\n3,i|j|k|l"), ",");
  assert.equal(core.detectDelimiter("id,notes\n1,x;y;z\n2,p;q;r\n3,m;n;o"), ",");
  assert.equal(core.detectDelimiter("id;tags\n1;a|b|c\n2;d|e|f"), ";");
});
