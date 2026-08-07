import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function createMemoryOpfs() {
  const directories = new Map();
  return {
    async getDirectory() {
      return {
        async removeEntry(name) {
          directories.delete(name);
        },
        async getDirectoryHandle(name) {
          if (!directories.has(name)) directories.set(name, new Map());
          const files = directories.get(name);
          return {
            async getFileHandle(filename) {
              return {
                async createWritable() {
                  let content = "";
                  return {
                    async write(value) { content = String(value); },
                    async close() { files.set(filename, content); },
                  };
                },
                async getFile() {
                  return { async text() { return files.get(filename) || ""; } };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createFile(text, name = "large.csv") {
  const blob = new Blob([text], { type: "text/csv" });
  Object.defineProperties(blob, {
    name: { value: name },
    lastModified: { value: 0 },
  });
  return blob;
}

function createChunkedFile(text, chunkSizes, name = "large.csv") {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    lastModified: 0,
    slice(start, end) {
      return new Blob([bytes.slice(start, end)]);
    },
    stream() {
      let offset = 0;
      let chunkIndex = 0;
      return new ReadableStream({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          const size = chunkSizes[chunkIndex % chunkSizes.length];
          controller.enqueue(bytes.slice(offset, offset + size));
          offset += size;
          chunkIndex += 1;
        },
      });
    },
  };
}

function loadLargeWorker() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="large-data-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed large data worker");
  const messages = [];
  const context = {
    Blob,
    TextDecoder,
    Uint8Array,
    Uint32Array,
    navigator: { storage: createMemoryOpfs() },
    self: { postMessage(message) { messages.push(message); } },
  };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return { context, messages };
}

test("large data worker streams CSV into OPFS and queries it without main-thread rows", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createFile('id,name,notes\n1,Alice,"first row"\n2,Bob,"contains target"\n3,Carol,last'),
    fileKind: "CSV",
    encoding: "auto",
    storeName: "test-store",
  } });
  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.result.headers)), ["id", "name", "notes"]);
  assert.equal(loaded.result.rowCount, 3);

  await context.self.onmessage({ data: {
    kind: "query",
    token: 1,
    request: { query: "target", caseSensitive: false, selectedColumn: -1, matchedOnly: true, filters: [], duplicateColumns: [], hiddenRows: [], sort: { column: -1, direction: "none" }, rowWindow: { mode: "all" } },
  } });
  const queried = messages.find((message) => message.type === "query-complete");
  assert.deepEqual([...queried.result.viewIndices], [1]);

  await context.self.onmessage({ data: { kind: "get-rows", token: 2, indices: [1] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(JSON.parse(JSON.stringify(rows.rows)), [{ rowIndex: 1, row: ["2", "Bob", "contains target"] }]);

  await context.self.onmessage({ data: { kind: "patch-cells", token: 3, changes: [{ rowIndex: 1, columnIndex: 1, value: "Bobby" }] } });
  await context.self.onmessage({ data: { kind: "get-rows", token: 4, indices: [1] } });
  const updated = messages.filter((message) => message.type === "rows").at(-1);
  assert.equal(updated.rows[0].row[1], "Bobby");
});

test("large data worker uses the same tolerant parser across stream chunk boundaries", async () => {
  const { context, messages } = loadLargeWorker();
  const text = [
    "id,name,payload,notes",
    '1,Alice,"{"tags":["a","b"],"ok":true}",```json',
    '{"text":"one, two","items":[1,2]}',
    "```",
    '2,Bob,{"tags":["c","d"],"ok":false},after',
  ].join("\r\n");
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [7, 11, 3, 19]),
    fileKind: "CSV",
    encoding: "auto",
    storeName: "tolerant-parser-store",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.result.headers)), ["id", "name", "payload", "notes"]);
  assert.equal(loaded.result.rowCount, 2);
  assert.equal(loaded.result.issues.inconsistentRows.length, 0);

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(JSON.parse(JSON.stringify(rows.rows)), [
    { rowIndex: 0, row: ["1", "Alice", '{"tags":["a","b"],"ok":true}', '```json\r\n{"text":"one, two","items":[1,2]}\r\n```'] },
    { rowIndex: 1, row: ["2", "Bob", '{"tags":["c","d"],"ok":false}', "after"] },
  ]);
});
