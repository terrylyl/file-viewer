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

test("a JSON-looking bracket that never closes stops merging columns at the next full row", () => {
  const core = loadWorkerCore();

  // 这些开头都能通过 JSON 前瞻（数字、t、n、-、"），但整个文件都不会闭合
  for (const note of ["[2024上半年", "[to do", "[null 值", "[-未定", '["未闭合', "{\"草稿"]) {
    const input = `name,note,tag\nalice,${note},a\nbob,ok,b\ncarol,fine,c`;
    const parsed = core.parseCsvText(input, { delimiter: "," });

    assert.equal(parsed.rows.length, 3, `should keep every row for ${JSON.stringify(note)}`);
    assert.equal(parsed.rows[0][1], note);
    assert.equal(parsed.rows[0][2], "a");
    assert.equal(parsed.rows[2][1], "fine");
  }
});

test("an unclosed bracket in the last column releases the following rows", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("name,note,tag\nalice,ok,[2024\nbob,ok,b\ncarol,fine,c", { delimiter: "," });

  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0][2], "[2024");
  assert.equal(parsed.rows[1][2], "b");
  assert.equal(parsed.rows[2][2], "c");
});

test("a quoted JSON-looking bracket that never closes releases following rows", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText('name,note,tag\nalice,"[2024上半年",a\nbob,ok,b', { delimiter: "," });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [
    ["alice", "[2024上半年", "a"],
    ["bob", "ok", "b"],
  ]);
});

test("a later stray closing bracket does not validate a false JSON guess", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("name,note,tag\nalice,[2024上半年,a\nbob,ok],b\ncarol,fine,c", { delimiter: "," });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [
    ["alice", "[2024上半年", "a"],
    ["bob", "ok]", "b"],
    ["carol", "fine", "c"],
  ]);
});

test("balanced bracketed prose is not mistaken for JSON", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("id,note,tag\n1,[用户表达,时间周期],z\n2,ok,q", { delimiter: "," });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.headers)), ["id", "note", "tag", "Column 4"]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [
    ["1", "[用户表达", "时间周期]", "z"],
    ["2", "ok", "q", ""],
  ]);
});

test("invalid bracketed prose releases irregular short title rows", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText(
    "id,note,tag\n1,[开始,a\n用户表达\n时间周期\n],z\n2,ok,q",
    { delimiter: "," },
  );

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.headers)), ["id", "note", "tag"]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [
    ["1", "[开始", "a"],
    ["用户表达", "", ""],
    ["时间周期", "", ""],
    ["]", "z", ""],
    ["2", "ok", "q"],
  ]);
});

test("an unclosed structure at EOF releases irregular short title rows", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("id,note,tag\n1,[2024开始,a\n用户表达\n时间周期", { delimiter: "," });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [
    ["1", "[2024开始", "a"],
    ["用户表达", "", ""],
    ["时间周期", "", ""],
  ]);
  assert.ok(parsed.issues.inconsistentRows.some((issue) => issue.type === "复杂字段未闭合"));
});

test("literal newline escapes and empty headers keep their CSV columns", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("id,,section\n1,\\n,用户表达\n2,text,时间周期", { delimiter: "," });

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.headers)), ["id", "Column 2", "section"]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [
    ["1", "\\n", "用户表达"],
    ["2", "text", "时间周期"],
  ]);
});

test("a bare JSON field may still span lines when the line stops on a separator", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText('id,payload\n1,{"a": 1,\n"b": 2}\n2,ok', { delimiter: "," });

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], '{"a": 1,\n"b": 2}');
  assert.equal(parsed.rows[1][1], "ok");
});

test("multiline bare JSON keeps commas inside strings and whitespace after separators", () => {
  const core = loadWorkerCore();
  const inputs = [
    'id,payload,tag\n1,{"text":"a,b"\n,"x":1},z\n2,ok,q',
    'id,payload,tag\n1,{"a":1,   \n"b":2},z\n2,ok,q',
    'id,payload,tag\n1,[1,\n2,3,4\n],z\n2,ok,q',
  ];

  for (const input of inputs) {
    const parsed = core.parseCsvText(input, { delimiter: "," });
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0][2], "z");
    assert.equal(parsed.rows[1][1], "ok");
    assert.equal(parsed.issues.inconsistentRows.length, 0);
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

test("pretty-printed JSON survives a newline right after the opening bracket", () => {
  const core = loadWorkerCore();
  const pretty = '[\n\t\t\t"BOLL-DMI",\n\t\t\t"MA-WR",\n\t\t\t"EMA-CCI"\n]';
  const parsed = core.parseCsvText(`id,payload,tag\n1,${pretty},x\n2,ok,y\n`, { delimiter: "," });

  assert.equal(parsed.headers.length, 3, "缩进用换行和用 Tab 不该有区别");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], pretty);
  assert.equal(parsed.rows[0][2], "x");

  const braces = core.parseCsvText('id,payload\n1,{\n  "a": 1,\n  "b": 2\n}\n2,ok\n', { delimiter: "," });
  assert.equal(braces.headers.length, 2);
  assert.equal(braces.rows.length, 2);
  assert.equal(braces.rows[0][1], '{\n  "a": 1,\n  "b": 2\n}');
});

test("a quoted JSON blob keeps its commas even when the inner quotes are bare", () => {
  const core = loadWorkerCore();
  // 双重编码：外层是 CSV 引号，里面是一段被转义过的 pretty-print 数组，
  // 缩进是字面的 \n\t，元素引号没有双写。2.3.5 能完整读出，2.3.7 起被切开。
  const payload = '[\\n\\t\\t\\t"BOLL-DMI",\\n\\t\\t\\t"MA-DMI",\\n\\t\\t\\t"MA-WR"\\n]';
  const parsed = core.parseCsvText(`id,payload,tag\n1,"${payload}",x\n2,ok,y\n`, { delimiter: "," });

  assert.equal(parsed.headers.length, 3);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], payload);
  assert.equal(parsed.rows[0][2], "x");

  // 引号内的括号不闭合时仍然要收得住，不能吞掉后面的行
  const unclosed = core.parseCsvText('id,note,tag\nalice,"[2024上半年",a\nbob,ok,b\n', { delimiter: "," });
  assert.equal(unclosed.rows.length, 2);
  assert.equal(unclosed.rows[0][1], "[2024上半年");
  assert.equal(unclosed.rows[1][0], "bob");
});

test("an invalid quoted structure cannot merge later CSV records", () => {
  const core = loadWorkerCore();
  const headers = Array.from({ length: 33 }, (_, index) => `h${index + 1}`);
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = Array.from({ length: 200 }, (_, rowIndex) => {
    const values = Array.from({ length: 33 }, (_, columnIndex) => `r${rowIndex + 1}c${columnIndex + 1}`);
    if (rowIndex === 0) values[12] = '[\n"plain"';
    if (rowIndex === 60) values[12] = "foo]";
    values[12] = quote(values[12]);
    return values.join(",");
  });
  const parsed = core.parseCsvText(`${headers.join(",")}\n${rows.join("\n")}\n`, { delimiter: "," });

  assert.equal(parsed.headers.length, 33);
  assert.equal(parsed.rows.length, 200, "后文偶然出现的 ] 不能确认一个跨记录的无效结构");
  assert.ok(parsed.rows.every((row) => row.length === 33));
  assert.equal(parsed.rows[0][12], '[\n"plain"');
  assert.equal(parsed.rows[60][12], "foo]");
});

test("a bracket followed by a newline and plain text still ends the record", () => {
  const core = loadWorkerCore();
  // 前瞻不通过时必须把等待期间吞掉的换行还回去，否则两行会被粘成一行
  const parsed = core.parseCsvText("id,note\n1,[\nalice,ok\nbob,fine\n", { delimiter: "," });

  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0][0], "1");
  assert.equal(parsed.rows[1][0], "alice");
  assert.equal(parsed.rows[2][0], "bob");
});

test("undoubled quotes are called out once the row widths break", () => {
  const core = loadWorkerCore();
  const broken = core.parseCsvText('id,prompt,tag\n1,"```json\n{"model": "gpt", "n": 1}\n```",q\n2,ok,y\n', { delimiter: "," });
  const hint = broken.issues.inconsistentRows.find((issue) => issue.type === "疑似引号未双写");
  assert.ok(hint, "列错位时要指出是引号没双写，而不是让用户以为工具坏了");
  assert.match(hint.detail, /双写/);

  // 同样的内容，引号双写之后必须干净通过，不能误报
  const fixed = core.parseCsvText('id,prompt,tag\n1,"```json\n{""model"": ""gpt"", ""n"": 1}\n```",q\n2,ok,y\n', { delimiter: "," });
  assert.equal(fixed.headers.length, 3);
  assert.equal(fixed.rows.length, 2);
  assert.equal(fixed.issues.inconsistentRows.length, 0);
  assert.equal(fixed.rows[0][1], '```json\n{"model": "gpt", "n": 1}\n```');
});

test("a single-cell title row does not take the header slot", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("月度报表\nid;name;age\n1;张三;20\n2;李四;30\n");

  assert.equal(JSON.stringify(parsed.headers), JSON.stringify(["id", "name", "age"]));
  // 标题行是用户的数据，不能丢：按原顺序留在数据区最前面
  assert.equal(JSON.stringify(parsed.rows[0]), JSON.stringify(["月度报表", "", ""]));
  assert.equal(JSON.stringify(parsed.rows[1]), JSON.stringify(["1", "张三", "20"]));
  assert.equal(parsed.rows.length, 3);
  const notice = parsed.issues.inconsistentRows.find((issue) => issue.type === "表头不在首行");
  assert.ok(notice, "换了表头行必须说明");
  assert.match(notice.detail, /第 2 行/);
});

test("two preamble lines are skipped, three data-shaped rows are not", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText("导出时间: 2026\n数据来源: XX\nid,name,age\n1,a,2\n2,b,3\n");
  assert.equal(JSON.stringify(parsed.headers), JSON.stringify(["id", "name", "age"]));
  assert.equal(parsed.rows.length, 4);

  // 表头比数据行窄是合法的（行尾多一个分隔符），不能当成前言跳过
  const trailing = core.parseCsvText("a,b,c\n1,2,3,\n4,5,6,\n7,8,9,\n");
  assert.equal(JSON.stringify(trailing.headers.slice(0, 3)), JSON.stringify(["a", "b", "c"]));
  assert.equal(JSON.stringify(trailing.rows[0].slice(0, 3)), JSON.stringify(["1", "2", "3"]));

  // 前言超过上限就整体放弃，不能把说明文字当表头
  const tooMany = core.parseCsvText(
    `报表\n说明一\n说明二\n说明三\nid,name,age\n${Array.from({ length: 10 }, (_, i) => `${i},a,2`).join("\n")}\n`,
  );
  assert.equal(tooMany.headers[0], "报表");
  assert.equal(tooMany.issues.inconsistentRows.some((issue) => issue.type === "表头不在首行"), false);
});

test("an explicit header row overrides detection and stays quiet about it", () => {
  const core = loadWorkerCore();
  const input = "报表\n说明一\n说明二\n说明三\nid,name,age\n1,a,2\n";

  // 自动识别会因为前言超过上限而放弃
  assert.equal(core.parseCsvText(input).headers[0], "报表");

  // 手动指定第 5 条记录为表头（1 起）
  const manual = core.parseCsvText(input, { headerIndex: 4 });
  assert.equal(JSON.stringify(manual.headers), JSON.stringify(["id", "name", "age"]));
  assert.equal(JSON.stringify(manual.rows[0]), JSON.stringify(["报表", "", ""]));
  assert.equal(JSON.stringify(manual.rows.at(-1)), JSON.stringify(["1", "a", "2"]));
  assert.equal(manual.rows.length, 5, "被跳过的前言行仍然保留");
  assert.equal(
    manual.issues.inconsistentRows.some((issue) => issue.type === "表头不在首行"),
    false,
    "用户自己指定的表头行不需要再提示",
  );

  // 超出记录数时收敛到最后一条，不抛错也不产生空表头
  const clamped = core.parseCsvText(input, { headerIndex: 99 });
  assert.equal(JSON.stringify(clamped.headers), JSON.stringify(["1", "a", "2"]));
});

test("严格模式关掉全部宽容处理，结果与 RFC4180 一致", () => {
  const core = loadWorkerCore();
  // 取不含内部引号的 payload：这样两种模式的期望值都无歧义
  const input = [
    "id,payload,tag",
    "1,{a:1,b:2},x",
    "2,=IF(A1 > 0, B1, C1),y",
    "3,C:\\dir\\,z",
  ].join("\n");

  // 宽容模式：JSON 合成一个 cell、公式合并回去、反斜杠按转义处理
  const tolerant = core.parseCsvText(input, { delimiter: "," });
  assert.equal(tolerant.rows[1][1], "=IF(A1 > 0, B1, C1)");
  assert.equal(tolerant.rows[1][2], "y");
  assert.equal(tolerant.rows[2][1], "C:\\dir\\", "反斜杠合并后由记录级修复拆回来");
  assert.equal(tolerant.rows[2][2], "z");

  // 严格模式：一律按标准 CSV 切，公式和反斜杠都不再特殊对待
  const strict = core.parseCsvText(input, { delimiter: ",", strict: true });
  assert.equal(strict.rows[0][1], "{a:1");
  assert.equal(strict.rows[0][2], "b:2}");
  assert.equal(strict.rows[1][1], "=IF(A1 > 0");
  assert.equal(strict.rows[1][2], " B1");
  assert.equal(strict.rows[2][1], "C:\\dir\\");
  assert.equal(strict.rows[2][2], "z");
});

test("严格模式下加引号的字段仍按 RFC4180 正确解析", () => {
  const core = loadWorkerCore();
  const parsed = core.parseCsvText(
    'id,note\n1,"say ""hi"", ok"\n2,"line1\nline2"\n3,"C:\\dir\\"\n',
    { delimiter: ",", strict: true },
  );

  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0][1], 'say "hi", ok');
  assert.equal(parsed.rows[1][1], "line1\nline2");
  assert.equal(parsed.rows[2][1], "C:\\dir\\");
});

test("detectDelimiter ignores separator-like characters inside a single column", () => {
  const core = loadWorkerCore();

  assert.equal(core.detectDelimiter("id,tags\n1,a|b|c|d\n2,e|f|g|h\n3,i|j|k|l"), ",");
  assert.equal(core.detectDelimiter("id,notes\n1,x;y;z\n2,p;q;r\n3,m;n;o"), ",");
  assert.equal(core.detectDelimiter("id;tags\n1;a|b|c\n2;d|e|f"), ";");
});

test("detectDelimiter rejects Markdown pipes that do not split the header", () => {
  const core = loadWorkerCore();
  const headers = Array.from({ length: 38 }, (_, index) => `h${index + 1}`);
  const markdownRow = `|${Array.from({ length: 60 }, (_, index) => `c${index + 1}`).join("|")}|`;
  const markdown = Array.from({ length: 8 }, () => markdownRow).join("\n");
  const tail = Array.from({ length: 36 }, (_, index) => `v${index + 3}`);
  const input = [
    headers.join(","),
    `1,"${markdown}",${tail.join(",")}`,
    `2,plain,${tail.join(",")}`,
  ].join("\n");

  assert.equal(core.detectDelimiter(input), ",");
  const parsed = core.parseCsvText(input);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.headers)), headers);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].length, 38);
  assert.equal(parsed.rows[0][1], markdown);
});
