import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function loadExcelWorker() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="excel-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed excel-worker-source");

  const messages = [];
  const context = {
    ArrayBuffer,
    DataView,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    clearTimeout,
    console,
    setTimeout,
  };
  context.self = context;
  context.postMessage = (message) => messages.push(message);
  vm.createContext(context);
  vm.runInContext(match[1], context, { timeout: 10_000 });
  assert.ok(context.XLSX, "vendored SheetJS should initialize inside the Excel Worker global scope");
  return { context, messages };
}

test("Excel Worker creates a valid XLSX export from the pinned local SheetJS asset", () => {
  const { context, messages } = loadExcelWorker();
  context.onmessage({ data: { kind: "export-xlsx", token: 42, matrix: [["name"], ["Alice"]] } });

  assert.equal(messages.length, 1);
  const result = messages[0];
  assert.equal(result.type, "export-complete");
  assert.equal(result.token, 42);
  assert.equal(Object.prototype.toString.call(result.buffer), "[object ArrayBuffer]");
  assert.deepEqual(Array.from(new Uint8Array(result.buffer).slice(0, 2)), [0x50, 0x4b]);
});
