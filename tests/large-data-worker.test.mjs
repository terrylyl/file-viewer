import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

function createFile(text, name = "large.csv") {
  const blob = new Blob([text], { type: "text/csv" });
  Object.defineProperties(blob, {
    name: { value: name },
    lastModified: { value: 0 },
  });
  return blob;
}

function createByteFile(bytes, chunkSizes = [bytes.byteLength], name = "large.csv") {
  const sliceRanges = [];
  return {
    name,
    size: bytes.byteLength,
    lastModified: 0,
    sliceRanges,
    slice(start, end) {
      sliceRanges.push([start, end]);
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

function createChunkedFile(text, chunkSizes, name = "large.csv") {
  return createByteFile(new TextEncoder().encode(text), chunkSizes, name);
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
    self: { postMessage(message) { messages.push(message); } },
  };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return { context, messages };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("large data worker indexes the original File without OPFS and reads rows on demand", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createFile('id,name,notes\n1,Alice,"first row"\n2,Bob,"contains target"\n3,Carol,last'),
    fileKind: "CSV",
    encoding: "auto",
  } });
  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "name", "notes"]);
  assert.equal(loaded.result.rowCount, 3);
  assert.equal(loaded.result.indexed, true);
  assert.equal("rows" in loaded.result, false);

  await context.self.onmessage({ data: { kind: "get-previews", token: 0, indices: [0] } });
  const firstPreview = messages.find((message) => message.type === "previews");
  assert.equal(firstPreview.rows[0].row[2], "first row");

  await context.self.onmessage({ data: {
    kind: "query",
    token: 1,
    request: { query: "target", caseSensitive: false, selectedColumn: -1, matchedOnly: true, filters: [], duplicateColumns: [], hiddenRows: [], sort: { column: -1, direction: "none" }, rowWindow: { mode: "all" } },
  } });
  const queried = messages.find((message) => message.type === "query-complete");
  assert.deepEqual([...queried.result.viewIndices], [1]);

  await context.self.onmessage({ data: { kind: "get-rows", token: 2, indices: [1] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [{ rowIndex: 1, row: ["2", "Bob", "contains target"] }]);

  await context.self.onmessage({ data: { kind: "patch-cells", token: 3, changes: [{ rowIndex: 1, columnIndex: 1, value: "Bobby" }] } });
  await context.self.onmessage({ data: { kind: "get-cell", token: 4, rowIndex: 1, columnIndex: 1 } });
  assert.equal(messages.find((message) => message.type === "cell")?.cell.value, "Bobby");
  await context.self.onmessage({ data: { kind: "get-previews", token: 5, indices: [1] } });
  assert.equal(messages.filter((message) => message.type === "previews").at(-1)?.rows[0].row[1], "Bobby");
});

test("large data worker uses the tolerant CSV parser across stream chunk boundaries", async () => {
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
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "name", "payload", "notes"]);
  assert.equal(loaded.result.rowCount, 2);
  assert.equal(loaded.result.issues.inconsistentRows.length, 0);

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [
    { rowIndex: 0, row: ["1", "Alice", '{"tags":["a","b"],"ok":true}', '```json\r\n{"text":"one, two","items":[1,2]}\r\n```'] },
    { rowIndex: 1, row: ["2", "Bob", '{"tags":["c","d"],"ok":false}', "after"] },
  ]);
});

test("large data worker keeps an unclosed bracket from merging later columns", async () => {
  const { context, messages } = loadLargeWorker();
  const text = [
    "name,note,tag",
    "alice,[2024上半年,a",
    "bob,ok,b",
    "carol,fine,c",
  ].join("\n");
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [5, 13, 3]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["name", "note", "tag"]);
  assert.equal(loaded.result.rowCount, 3);

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1, 2] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [
    { rowIndex: 0, row: ["alice", "[2024上半年", "a"] },
    { rowIndex: 1, row: ["bob", "ok", "b"] },
    { rowIndex: 2, row: ["carol", "fine", "c"] },
  ]);
});

test("large data worker releases rows after a quoted JSON-looking bracket", async () => {
  const { context, messages } = loadLargeWorker();
  const text = 'name,note,tag\r\nalice,"[2024上半年",a\r\nbob,ok,b';
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [1, 7, 2, 11]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.rowCount, 2);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1] } });
  assert.deepEqual(plain(messages.find((message) => message.type === "rows").rows), [
    { rowIndex: 0, row: ["alice", "[2024上半年", "a"] },
    { rowIndex: 1, row: ["bob", "ok", "b"] },
  ]);
});

test("large data worker rejects a false structure closed on a later row", async () => {
  const { context, messages } = loadLargeWorker();
  const text = "name,note,tag\nalice,[2024上半年,a\nbob,ok],b\ncarol,fine,c";
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [2, 1, 5, 17]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.rowCount, 3);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1, 2] } });
  assert.deepEqual(plain(messages.find((message) => message.type === "rows").rows), [
    { rowIndex: 0, row: ["alice", "[2024上半年", "a"] },
    { rowIndex: 1, row: ["bob", "ok]", "b"] },
    { rowIndex: 2, row: ["carol", "fine", "c"] },
  ]);
});

test("large data worker rejects balanced prose and preserves short title rows", async () => {
  for (const expected of [
    {
      text: "id,note,tag\n1,[用户表达,时间周期],z\n2,ok,q",
      headers: ["id", "note", "tag", "Column 4"],
      rows: [
        ["1", "[用户表达", "时间周期]", "z"],
        ["2", "ok", "q", ""],
      ],
    },
    {
      text: "id,note,tag\n1,[开始,a\n用户表达\n时间周期\n],z\n2,ok,q",
      headers: ["id", "note", "tag"],
      rows: [
        ["1", "[开始", "a"],
        ["用户表达", "", ""],
        ["时间周期", "", ""],
        ["]", "z", ""],
        ["2", "ok", "q"],
      ],
    },
    {
      text: "id,note,tag\n1,[2024开始,a\n用户表达\n时间周期",
      headers: ["id", "note", "tag"],
      rows: [
        ["1", "[2024开始", "a"],
        ["用户表达", "", ""],
        ["时间周期", "", ""],
      ],
    },
  ]) {
    const { context, messages } = loadLargeWorker();
    await context.self.onmessage({ data: {
      kind: "load-large-file",
      file: createChunkedFile(expected.text, [1, 4, 2, 9]),
      fileKind: "CSV",
      encoding: "utf-8",
    } });

    const loaded = messages.find((message) => message.type === "loaded");
    assert.deepEqual(plain(loaded.result.headers), expected.headers);
    await context.self.onmessage({
      data: { kind: "get-rows", token: 1, indices: expected.rows.map((_, index) => index) },
    });
    assert.deepEqual(
      plain(messages.find((message) => message.type === "rows").rows),
      expected.rows.map((row, rowIndex) => ({ rowIndex, row })),
    );
  }
});

test("large data worker preserves multiline JSON with ambiguous separators", async () => {
  for (const text of [
    'id,payload,tag\n1,{"text":"a,b"\n,"x":1},z\n2,ok,q',
    'id,payload,tag\n1,{"a":1,   \n"b":2},z\n2,ok,q',
    'id,payload,tag\n1,[1,\n2,3,4\n],z\n2,ok,q',
  ]) {
    const { context, messages } = loadLargeWorker();
    await context.self.onmessage({ data: {
      kind: "load-large-file",
      file: createChunkedFile(text, [3, 1, 9, 2]),
      fileKind: "CSV",
      encoding: "utf-8",
    } });

    const loaded = messages.find((message) => message.type === "loaded");
    assert.equal(loaded.result.rowCount, 2);
    assert.equal(loaded.result.issues.inconsistentRows.length, 0);
    await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1] } });
    const rows = messages.find((message) => message.type === "rows").rows;
    assert.equal(rows[0].row[2], "z");
    assert.equal(rows[1].row[1], "ok");
  }
});

test("large data worker ignores dense Markdown pipes absent from the header", async () => {
  const { context, messages } = loadLargeWorker();
  const headers = Array.from({ length: 38 }, (_, index) => `h${index + 1}`);
  const markdownRow = `|${Array.from({ length: 60 }, (_, index) => `c${index + 1}`).join("|")}|`;
  const markdown = Array.from({ length: 8 }, () => markdownRow).join("\r\n");
  const tail = Array.from({ length: 36 }, (_, index) => `v${index + 3}`);
  const text = [
    headers.join(","),
    `1,"${markdown}",${tail.join(",")}`,
    `2,plain,${tail.join(",")}`,
  ].join("\r\n");
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [1, 7, 3, 19]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.file.delimiter, ",");
  assert.deepEqual(plain(loaded.result.headers), headers);
  assert.equal(loaded.result.rowCount, 2);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
  const row = messages.find((message) => message.type === "rows").rows[0].row;
  assert.equal(row.length, 38);
  assert.equal(row[1], markdown);
});

test("large data worker replays a rolled back Markdown fence at the right byte offsets", async () => {
  const { context, messages } = loadLargeWorker();
  const text = ["name,note,tag", "alice,```x,a", "bob,ok,b", "carol,fine,c"].join("\n");
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [5, 13, 3]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1, 2] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [
    { rowIndex: 0, row: ["alice", "```x", "a"] },
    { rowIndex: 1, row: ["bob", "ok", "b"] },
    { rowIndex: 2, row: ["carol", "fine", "c"] },
  ]);
});

test("large data worker never lets a leading empty record become the header", async () => {
  for (const [label, text] of [
    ["前导空行", "\nid,name,age\n1,张三,20\n2,李四,30\n"],
    ["占位行", ",,\nid,name,age\n1,张三,20\n"],
  ]) {
    const { context, messages } = loadLargeWorker();
    await context.self.onmessage({ data: {
      kind: "load-large-file",
      file: createChunkedFile(text, [3, 11, 7]),
      fileKind: "CSV",
      encoding: "utf-8",
    } });

    const loaded = messages.find((message) => message.type === "loaded");
    assert.deepEqual(plain(loaded.result.headers), ["id", "name", "age"], label);

    await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
    const rows = messages.find((message) => message.type === "rows");
    assert.deepEqual(plain(rows.rows[0].row), ["1", "张三", "20"], label);
  }
});

test("large data worker takes the header from below a title row", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile("月度报表\nid;name;age\n1;张三;20\n2;李四;30\n", [7, 3, 15]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "name", "age"]);
  assert.equal(loaded.result.rowCount, 3, "标题行仍然算一行数据，不能丢");
  assert.ok(loaded.result.issues.inconsistentRows.some((issue) => issue.type === "表头不在首行"));

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [
    { rowIndex: 0, row: ["月度报表", "", ""] },
    { rowIndex: 1, row: ["1", "张三", "20"] },
  ]);
});

test("large data worker honours an explicit header row", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile("报表\n说明一\n说明二\n说明三\nid;name;age\n1;a;2\n", [6, 4, 11]),
    fileKind: "CSV",
    delimiter: ";",
    headerRow: 5,
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "name", "age"]);
  assert.equal(loaded.result.rowCount, 5, "前言行仍然保留为数据行");
  assert.equal(
    loaded.result.issues.inconsistentRows.some((issue) => issue.type === "表头不在首行"),
    false,
    "用户自己指定的表头行不需要再提示",
  );

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 4] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [
    { rowIndex: 0, row: ["报表", "", ""] },
    { rowIndex: 4, row: ["1", "a", "2"] },
  ]);
});

test("large data worker merges unquoted formulas back into one column", async () => {
  const { context, messages } = loadLargeWorker();
  const text = [
    "id,formula,result",
    "1,=IF(A1 > 0, B1, C1),ok",
    "2,=ROUND(SUM(A2, B2), 2),done",
    '3,=CONCAT("a, b", C1),fine',
    "4,plain,last",
  ].join("\n");
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [9, 4, 23]),
    fileKind: "CSV",
    delimiter: ",",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "formula", "result"]);
  assert.equal(loaded.result.issues.inconsistentRows.length, 0, "合并回去之后不该再报列数不一致");

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1, 2, 3] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows), [
    { rowIndex: 0, row: ["1", "=IF(A1 > 0, B1, C1)", "ok"] },
    { rowIndex: 1, row: ["2", "=ROUND(SUM(A2, B2), 2)", "done"] },
    { rowIndex: 2, row: ["3", '=CONCAT("a, b", C1)', "fine"] },
    { rowIndex: 3, row: ["4", "plain", "last"] },
  ]);
});

test("large data worker keeps pretty-printed JSON in one cell", async () => {
  const { context, messages } = loadLargeWorker();
  const pretty = '[\n\t\t\t"BOLL-DMI",\n\t\t\t"MA-WR"\n]';
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(`id,payload,tag\n1,${pretty},x\n2,ok,y\n`, [6, 13, 4]),
    fileKind: "CSV",
    delimiter: ",",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "payload", "tag"]);
  assert.equal(loaded.result.rowCount, 2, "开括号后面的换行是 JSON 缩进，不是记录边界");

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows[0].row), ["1", pretty, "x"]);
});

test("large data worker keeps a quoted JSON blob with bare inner quotes intact", async () => {
  const { context, messages } = loadLargeWorker();
  const payload = '[\\n\\t\\t\\t"BOLL-DMI",\\n\\t\\t\\t"MA-DMI"\\n]';
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(`id,payload,tag\n1,"${payload}",x\n2,ok,y\n`, [5, 11, 3]),
    fileKind: "CSV",
    delimiter: ",",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "payload", "tag"]);
  assert.equal(loaded.result.rowCount, 2);

  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
  const rows = messages.find((message) => message.type === "rows");
  assert.deepEqual(plain(rows.rows[0].row), ["1", payload, "x"]);
});

test("large data worker points at undoubled quotes when rows break", async () => {
  const { context, messages } = loadLargeWorker();
  const text = 'id,prompt,tag\n1,"```json\n{"model": "gpt", "n": 1}\n```",q\n2,ok,y\n';
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [7, 3, 17]),
    fileKind: "CSV",
    delimiter: ",",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  const hint = loaded.result.issues.inconsistentRows.find((issue) => issue.type === "疑似引号未双写");
  assert.ok(hint, "大文件路径同样要指出是引号没双写");
});

test("large data worker warns when the table collapses into a single column", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    // 前言行超过跳过上限，探测放弃分号；这时不能静默
    file: createChunkedFile("报表\n说明一\n说明二\n说明三\nid;name;age\n1;a;2\n", [5, 9]),
    fileKind: "CSV",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.headers.length, 1);
  const warning = loaded.result.issues.inconsistentRows.find((issue) => issue.type === "分隔符可能判断有误");
  assert.ok(warning, "大文件路径同样不能静默");
  assert.match(warning.detail, /分号/);
});

test("large data worker honours an explicitly supplied delimiter", async () => {
  const { context, messages } = loadLargeWorker();
  // .tsv 由扩展名定分隔符：这个文件带标题行，靠探测会被判成逗号
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile("导出说明\nid\tname\tage\n1\ta\t2\n", [4, 13]),
    fileKind: "CSV",
    delimiter: "\t",
    encoding: "utf-8",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.file.delimiter, "\t");
  assert.equal(loaded.result.headers.length, 3);
});

test("large data worker returns bounded previews and an exact full cell", async () => {
  const { context, messages } = loadLargeWorker();
  const fullValue = `prefix,"quoted"\n${"x".repeat(900)}`;
  const csvValue = fullValue.replaceAll('"', '""');
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(`id,text\r\n1,"${csvValue}"`, [1, 2, 5, 13]),
    fileKind: "CSV",
    encoding: "auto",
  } });

  await context.self.onmessage({ data: { kind: "get-previews", token: 1, indices: [0] } });
  const preview = messages.find((message) => message.type === "previews").rows[0];
  // 比 PREVIEW_LIMIT 多一个字符，主线程 summarize() 才能识别出这个 cell 被截断了
  assert.equal(preview.row[1].length, 501);
  assert.equal(preview.row[1], fullValue.slice(0, 501));

  await context.self.onmessage({ data: { kind: "get-cell", token: 2, rowIndex: 0, columnIndex: 1 } });
  const cell = messages.find((message) => message.type === "cell").cell;
  assert.equal(cell.value, fullValue);
});

test("large data worker reads huge-row cell previews with bounded concurrency", async () => {
  const { context, messages } = loadLargeWorker();
  const columnCount = 20;
  const headers = Array.from({ length: columnCount }, (_, index) => `c${index + 1}`);
  const values = Array.from({ length: columnCount }, (_, index) => String(index).repeat(6000));
  const file = createChunkedFile(`${headers.join(",")}\n${values.join(",")}`, [8192]);
  const originalSlice = file.slice.bind(file);
  let trackPreviewReads = false;
  let activeReads = 0;
  let maxActiveReads = 0;
  file.slice = (start, end) => {
    const blob = originalSlice(start, end);
    if (!trackPreviewReads) return blob;
    return {
      async arrayBuffer() {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        try {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return await blob.arrayBuffer();
        } finally {
          activeReads -= 1;
        }
      },
    };
  };

  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file,
    fileKind: "CSV",
    delimiter: ",",
    encoding: "utf-8",
  } });
  trackPreviewReads = true;
  await context.self.onmessage({ data: { kind: "get-previews", token: 1, indices: [0] } });

  const preview = messages.find((message) => message.type === "previews").rows[0];
  assert.equal(preview.row.length, columnCount);
  assert.equal(preview.row[1], values[1].slice(0, 501));
  assert.ok(maxActiveReads > 1, `expected concurrent preview reads, got ${maxActiveReads}`);
  assert.ok(maxActiveReads <= 16, `preview concurrency exceeded its bound: ${maxActiveReads}`);
});

test("large data worker reads only the requested CSV cell byte range", async () => {
  const { context, messages } = loadLargeWorker();
  const left = "a".repeat(1000);
  const right = "b".repeat(1200);
  const file = createChunkedFile(`id,left,right\n1,${left},${right}`, [17, 31]);
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file,
    fileKind: "CSV",
    encoding: "auto",
  } });
  file.sliceRanges.length = 0;

  await context.self.onmessage({ data: { kind: "get-cell", token: 1, rowIndex: 0, columnIndex: 2 } });
  assert.equal(messages.find((message) => message.type === "cell").cell.value, right);
  assert.deepEqual(file.sliceRanges, [[file.size - right.length, file.size]]);
});

test("large data worker decodes indexed GB18030 cells from exact byte ranges", async () => {
  const { context, messages } = loadLargeWorker();
  const ascii = new TextEncoder();
  const bytes = new Uint8Array([
    ...ascii.encode("id,"), 0xb1, 0xb8, 0xd7, 0xa2, ...ascii.encode("\r\n1,"), 0xd6, 0xd0, 0xce, 0xc4,
  ]);
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createByteFile(bytes, [4, 1, 3]),
    fileKind: "CSV",
    encoding: "gb18030",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.deepEqual(plain(loaded.result.headers), ["id", "备注"]);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
  assert.deepEqual(plain(messages.find((message) => message.type === "rows").rows[0].row), ["1", "中文"]);
});

test("large data worker keeps UTF-8 when the sample boundary splits a character", async () => {
  const { context, messages } = loadLargeWorker();
  // 采样上限是 512 KiB，构造一个让边界正好落在三字节汉字中间的文件
  const head = new TextEncoder().encode("id,txt\n1,");
  const body = new TextEncoder().encode(`${"中".repeat(400000)}\n`);
  const bytes = new Uint8Array(head.length + body.length);
  bytes.set(head, 0);
  bytes.set(body, head.length);
  assert.equal((bytes[512 * 1024 - 1] & 0xc0) === 0x80, true, "boundary should land inside a character");

  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createByteFile(bytes, [1 << 16]),
    fileKind: "CSV",
    encoding: "auto",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.file.encoding, "UTF-8");
  assert.deepEqual(plain(loaded.result.headers), ["id", "txt"]);
});

test("large data worker treats GB18030 trailing bytes as text, not as escapes", async () => {
  const { context, messages } = loadLargeWorker();
  const ascii = new TextEncoder();
  // 0x81 0x5C 是一个合法 GBK 汉字，次字节正好是 ASCII 的反斜杠
  const bytes = new Uint8Array([
    ...ascii.encode("id,name,tail\n1,"),
    0x81, 0x5c,
    ...ascii.encode(",x\n2,ok,y\n"),
  ]);
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createByteFile(bytes, [bytes.length]),
    fileKind: "CSV",
    encoding: "gb18030",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.rowCount, 2);
  assert.equal(loaded.result.issues.inconsistentRows.length, 0);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
  const row = plain(messages.find((message) => message.type === "rows").rows[0].row);
  assert.equal(row.length, 3, "the trailing byte must not swallow the delimiter");
  assert.equal(row[2], "x");
});

test("large data worker does not let a stray bracket collapse the whole file", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile("name,note\nalice,[TODO\nbob,ok\ncarol,fine\n", [6, 13, 4]),
    fileKind: "CSV",
    encoding: "auto",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.rowCount, 3);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1, 2] } });
  assert.deepEqual(plain(messages.find((message) => message.type === "rows").rows), [
    { rowIndex: 0, row: ["alice", "[TODO"] },
    { rowIndex: 1, row: ["bob", "ok"] },
    { rowIndex: 2, row: ["carol", "fine"] },
  ]);
});

test("large data worker splits a backslash-terminated cell back into its columns", async () => {
  const { context, messages } = loadLargeWorker();
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile("path,next\nC:\\data\\,2024\nb,3\n", [5, 9, 3]),
    fileKind: "CSV",
    encoding: "auto",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.rowCount, 2);
  assert.equal(loaded.result.issues.inconsistentRows.length, 0);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0] } });
  assert.deepEqual(plain(messages.find((message) => message.type === "rows").rows[0].row), ["C:\\data\\", "2024"]);
});

test("large data worker handles JSONL CRLF split across stream chunks", async () => {
  const { context, messages } = loadLargeWorker();
  const text = '{"id":1,"text":"first"}\r\n{"id":2,"text":"second"}\r\n';
  const firstCr = text.indexOf("\r") + 1;
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createChunkedFile(text, [firstCr, 1, 7], "large.jsonl"),
    fileKind: "JSONL",
    encoding: "auto",
  } });

  const loaded = messages.find((message) => message.type === "loaded");
  assert.equal(loaded.result.rowCount, 2);
  await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices: [0, 1] } });
  assert.deepEqual(plain(messages.find((message) => message.type === "rows").rows), [
    { rowIndex: 0, row: ["1", "first"] },
    { rowIndex: 1, row: ["2", "second"] },
  ]);
});
