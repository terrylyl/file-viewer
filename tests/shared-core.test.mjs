import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function loadSharedCore(...paths) {
  const context = {};
  vm.createContext(context);
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    vm.runInContext(source, context);
  }
  return context;
}

test("shared CSV export escapes spreadsheet formulas and CSV syntax", () => {
  const core = loadSharedCore("../src/shared/csv-utils.js");

  assert.equal(core.escapeCsv("=1+1"), "'=1+1");
  assert.equal(core.escapeCsv("+cmd"), "'+cmd");
  assert.equal(core.escapeCsv("-cmd"), "'-cmd");
  assert.equal(core.escapeCsv("@cmd"), "'@cmd");
  assert.equal(core.escapeCsv("  =1+1"), "'  =1+1");
  assert.equal(core.escapeCsv('a,"b"'), '"a,""b"""');
  assert.equal(core.escapeCsv("safe"), "safe");
});

test("shared filters evaluate values consistently for main thread and worker callers", () => {
  const core = loadSharedCore("../src/shared/filters.js");
  const filters = [
    {
      columnIndex: 0,
      mode: "exclude",
      values: new Set(["blocked"]),
      condition: { type: "contains", value: "a" },
    },
    {
      columnIndex: 1,
      mode: "all",
      values: new Set(),
      condition: { type: "list-token-count-gte", value: "2" },
    },
  ];

  assert.equal(core.rowPassesColumnFilters(["alpha", "x,y"], filters), true);
  assert.equal(core.rowPassesColumnFilters(["blocked", "x,y"], filters), false);
  assert.equal(core.rowPassesColumnFilters(["alpha", "x"], filters), false);
  assert.equal(core.evaluateColumnFilterCondition("42", { type: "number-gte", value: "40" }), true);
  assert.equal(core.evaluateColumnFilterCondition("AB-12", { type: "regex", value: "^AB-\\d+$" }), true);
  assert.equal(core.evaluateColumnFilterCondition("AB-12", { type: "regex", value: "[" }), false);
});

test("column profiles detect conservative types and strict dates", () => {
  const core = loadSharedCore("../src/shared/column-profile.js");

  assert.equal(core.classifyColumnProfileValue("42"), "integer");
  assert.equal(core.classifyColumnProfileValue("3.14"), "number");
  assert.equal(core.classifyColumnProfileValue("00123"), "text");
  assert.equal(core.classifyColumnProfileValue("2026-07-22"), "date");
  assert.equal(core.classifyColumnProfileValue("2026-02-30"), "text");
  assert.equal(core.classifyColumnProfileValue("是"), "boolean");
});

test("column profiles aggregate quality and numeric metrics in one pass", () => {
  const core = loadSharedCore("../src/shared/column-profile.js");
  const values = ["1", "2", "2", "3", "4", "5", "6", "7", "8", "9", "10", "bad", "  "];
  const profile = core.buildColumnProfile(values.length, (index) => values[index]);

  assert.equal(profile.type, "integer");
  assert.equal(profile.rowCount, 13);
  assert.equal(profile.emptyCount, 1);
  assert.equal(profile.nonEmptyCount, 12);
  assert.equal(profile.uniqueCount, 11);
  assert.equal(profile.duplicateRowCount, 2);
  assert.equal(profile.invalidCount, 1);
  assert.equal(profile.numeric.min, 1);
  assert.equal(profile.numeric.max, 10);
  assert.ok(Math.abs(profile.numeric.mean - 5.1818181818) < 1e-9);
  assert.equal(profile.topValues[0].value, "2");
  assert.equal(profile.topValues[0].count, 2);
});

test("column profiles bound high-cardinality value tracking", () => {
  const core = loadSharedCore("../src/shared/column-profile.js");
  const values = Array.from({ length: 101 }, (_, index) => `value-${index}`);
  const profile = core.buildColumnProfile(values.length, (index) => values[index], { exactValueLimit: 100 });

  assert.equal(profile.uniqueCount, null);
  assert.equal(profile.uniqueLowerBound, 101);
  assert.equal(profile.valueCountApproximate, true);
  assert.ok(profile.topValues.length <= 10);
});

test("mixed column profiles retain a dominant type for anomaly filtering", () => {
  const core = loadSharedCore("../src/shared/column-profile.js");
  const values = ["1", "2", "3", "bad"];
  const profile = core.buildColumnProfile(values.length, (index) => values[index]);

  assert.equal(profile.type, "mixed");
  assert.equal(profile.dominantType, "integer");
  assert.equal(profile.invalidCount, 1);
});

test("profile filters keep empty and type-invalid values", () => {
  const core = loadSharedCore("../src/shared/column-profile.js", "../src/shared/filters.js");

  assert.equal(core.evaluateColumnFilterCondition("   ", { type: "empty" }), true);
  assert.equal(core.evaluateColumnFilterCondition("12", { type: "profile-invalid", value: "number" }), false);
  assert.equal(core.evaluateColumnFilterCondition("oops", { type: "profile-invalid", value: "number" }), true);
  assert.equal(core.evaluateColumnFilterCondition("", { type: "profile-invalid", value: "number" }), false);
});

test("shared issue analysis reports duplicates, sparse rows, and long fields", () => {
  const core = loadSharedCore("../src/shared/issues.js");
  const parsed = core.analyzeRows(
    ["id", "name", "name"],
    [
      ["1", "Alice", "QA"],
      ["2", "", ""],
      ["3", "Bob", "x".repeat(8)],
    ],
    { longFieldThreshold: 8 },
  );

  assert.equal(parsed.duplicateColumns.length, 1);
  assert.equal(parsed.duplicateColumns[0].columnName, "name");
  assert.equal(parsed.sparseRows.length, 1);
  assert.equal(parsed.sparseRows[0].rowNumber, 3);
  assert.equal(parsed.longFields.length, 1);
  assert.equal(parsed.longFields[0].columnName, "name");
});

test("Excel helpers trim inflated blank worksheet ranges", () => {
  const core = loadSharedCore("../src/shared/excel-utils.js");
  const sheet = [];
  sheet[0] = [];
  sheet[0][0] = { v: "id" };
  sheet[1] = [];
  sheet[1][0] = { v: "1" };
  sheet[1][2] = { v: "Alice" };
  sheet[999] = [];
  sheet[999][99] = { v: "   " };
  sheet["!ref"] = "A1:CV1000";

  const range = core.trimExcelSheetRefToContent(sheet);

  assert.equal(JSON.stringify(range), JSON.stringify({ s: { r: 0, c: 0 }, e: { r: 1, c: 2 } }));
  assert.equal(sheet["!ref"], "A1:C2");
  assert.equal(
    JSON.stringify(core.trimExcelMatrixToContent([
      ["id", "", ""],
      ["1", "", "Alice"],
      ["", "", ""],
    ])),
    JSON.stringify([
      ["id", "", ""],
      ["1", "", "Alice"],
    ]),
  );
});

test("Excel helpers trim six-figure and million-row inflated worksheet ranges", () => {
  const core = loadSharedCore("../src/shared/excel-utils.js");

  for (const inflatedRowCount of [100_000, 1_000_000]) {
    const sheet = [];
    for (let index = 0; index < 10; index += 1) {
      sheet[index] = [{ v: index === 0 ? "id" : String(index) }, { v: index === 0 ? "name" : `row-${index}` }];
    }
    sheet["!ref"] = `A1:B${inflatedRowCount}`;

    const range = core.trimExcelSheetRefToContent(sheet);

    assert.equal(
      JSON.stringify(range),
      JSON.stringify({ s: { r: 0, c: 0 }, e: { r: 9, c: 1 } }),
      `should ignore blank rows up to ${inflatedRowCount}`,
    );
    assert.equal(sheet["!ref"], "A1:B10");
  }
});
