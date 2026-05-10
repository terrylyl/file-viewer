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
