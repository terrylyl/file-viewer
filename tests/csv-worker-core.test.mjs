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
