import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function loadQueryCore() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(
    /<script id="query-worker-source" type="text\/plain">([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "index.html should embed query-worker-source");

  const context = {
    console,
    self: {
      postMessage() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  assert.ok(context.self.__QUERY_CORE__, "query worker should expose testable core");
  return context.self.__QUERY_CORE__;
}

function runWorkerQuery(rows, request) {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(
    /<script id="query-worker-source" type="text\/plain">([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "index.html should embed query-worker-source");

  const messages = [];
  const context = {
    console,
    self: {
      postMessage(message) {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  context.self.onmessage({
    data: {
      kind: "set-data",
      version: 1,
      chunks: [rows],
      rowCount: rows.length,
      chunkSize: 5000,
    },
  });
  context.self.onmessage({
    data: {
      kind: "query",
      token: 1,
      version: 1,
      request: {
        query: "",
        caseSensitive: false,
        selectedColumn: -1,
        matchedOnly: false,
        filters: [],
        hiddenRows: [],
        duplicateColumns: [],
        sort: { column: -1, direction: "none" },
        rowWindow: { mode: "all" },
        ...request,
      },
    },
  });
  return messages.find((message) => message.type === "query-complete")?.result;
}

test("list token filter keeps delimited multi-item cells", () => {
  const core = loadQueryCore();
  const filters = [
    {
      columnIndex: 0,
      mode: "all",
      values: [],
      condition: { type: "list-token-count-gte", value: "2" },
    },
  ];

  assert.equal(core.rowPassesColumnFilters(["[a,b,c]"], filters), true);
  assert.equal(core.rowPassesColumnFilters(["a,b,c"], filters), true);
  assert.equal(core.rowPassesColumnFilters(["a"], filters), false);
  assert.equal(core.rowPassesColumnFilters(["b"], filters), false);
  assert.equal(core.rowPassesColumnFilters(["c"], filters), false);
  assert.equal(core.rowPassesColumnFilters(["d"], filters), false);
  assert.equal(core.rowPassesColumnFilters(["[e,f]"], filters), true);
  assert.equal(core.rowPassesColumnFilters(["e,f"], filters), true);
});

test("advanced column filters support text, regex, and numeric conditions", () => {
  const core = loadQueryCore();

  assert.equal(core.evaluateColumnFilterCondition(" Alice ", { type: "non-empty" }), true);
  assert.equal(core.evaluateColumnFilterCondition("   ", { type: "non-empty" }), false);
  assert.equal(core.evaluateColumnFilterCondition("Alpha Beta", { type: "contains", value: "beta" }), true);
  assert.equal(core.evaluateColumnFilterCondition("Alpha Beta", { type: "not-contains", value: "gamma" }), true);
  assert.equal(core.evaluateColumnFilterCondition("AB-128", { type: "regex", value: "^AB-\\d+$" }), true);
  assert.equal(core.evaluateColumnFilterCondition("AB-128", { type: "regex", value: "[" }), false);
  assert.equal(core.evaluateColumnFilterCondition("42.5", { type: "number-gt", value: "40" }), true);
  assert.equal(core.evaluateColumnFilterCondition("42.5", { type: "number-lte", value: "42" }), false);
});

test("distinct list token filter counts duplicate list items once", () => {
  const core = loadQueryCore();

  assert.equal(core.evaluateColumnFilterCondition("[a,a]", { type: "list-token-count-gte", value: "2" }), true);
  assert.equal(core.evaluateColumnFilterCondition("a", { type: "list-token-count-gte", value: "" }), true);
  assert.equal(core.evaluateColumnFilterCondition("", { type: "list-token-count-gte", value: "0" }), true);
  assert.equal(core.evaluateColumnFilterCondition("a", { type: "list-token-count-gte", value: "-1" }), true);
  assert.equal(core.evaluateColumnFilterCondition("[a,a]", { type: "distinct-list-token-count-gte", value: "2" }), false);
  assert.equal(core.evaluateColumnFilterCondition("[a,b]", { type: "distinct-list-token-count-gte", value: "2" }), true);
  assert.equal(core.evaluateColumnFilterCondition("a,b", { type: "distinct-list-token-count-gte", value: "2" }), true);
});

test("numeric column filters with empty parameters stay inactive", () => {
  const core = loadQueryCore();

  assert.equal(core.evaluateColumnFilterCondition("1", { type: "number-gt", value: "" }), true);
  assert.equal(core.evaluateColumnFilterCondition("1", { type: "number-gt", value: "2" }), false);
});

test("list token parsing handles bracketed and plain delimited lists", () => {
  const core = loadQueryCore();

  assert.equal(JSON.stringify(core.tokenizeListCellValue("[a,, b]")), JSON.stringify(["a", "b"]));
  assert.equal(JSON.stringify(core.tokenizeListCellValue("a,b")), JSON.stringify(["a", "b"]));
  assert.equal(JSON.stringify(core.tokenizeListCellValue("a")), JSON.stringify(["a"]));
  assert.equal(JSON.stringify(core.tokenizeListCellValue("[]")), JSON.stringify([]));
  assert.equal(JSON.stringify(core.tokenizeListCellValue("")), JSON.stringify([]));
});

test("duplicate-value filters keep every repeated non-empty row", () => {
  const result = runWorkerQuery(
    [["A"], ["B"], ["A"], [""], [""], ["C"]],
    { duplicateColumns: [0] },
  );

  assert.deepEqual(result.viewIndices, [0, 2]);
});

test("row windows apply after exclusions and sorting", () => {
  const rows = [["10"], ["30"], ["20"], ["40"]];
  const first = runWorkerQuery(rows, {
    hiddenRows: [1],
    sort: { column: 0, direction: "desc" },
    rowWindow: { mode: "first", count: 2 },
  });
  const range = runWorkerQuery(rows, {
    sort: { column: 0, direction: "desc" },
    rowWindow: { mode: "range", start: 2, end: 3 },
  });

  assert.deepEqual(first.viewIndices, [3, 2]);
  assert.deepEqual(range.viewIndices, [1, 2]);
});
