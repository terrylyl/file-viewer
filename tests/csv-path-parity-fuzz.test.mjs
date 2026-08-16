import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// 跨路径差分模糊测试：随机生成**畸形** CSV，比对普通路径与大文件路径的表头和数据。
//
// csv-path-parity.test.mjs 钉的是 44 种手写形态，csv-differential-fuzz.test.mjs 只覆盖
// 合法 CSV。两条路径真正容易分叉的地方恰恰在这两者之间：畸形内容 + 修复逻辑的组合。
// 大文件路径改成严格优先的那一轮，这个测试一次就抓出六处分叉——表头行判定用了宽容
// 取样、`\` + 分隔符缺了向后看一个字符、引号内反斜杠被当成转义、宽容重读把喂到第几个
// 字符当成记录终点（一次回滚重放吐出多条记录时会丢行）等等，44 种形态一个都没覆盖到。
//
// 种子固定，失败可复现。
//
// 只比对 headers/rows：告警里的「复杂字段未闭合」取决于两条路径各自在哪个位置重新
// 严格解析，畸形输入下仍有约 0.3% 的取值差异，那是待做的状态机合并要收拾的。数据本身
// 必须一致——这里就是钉死这一条。

function loadWorkerSource(id) {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(new RegExp(`<script id="${id}" type="text/plain">([\\s\\S]*?)</script>`));
  assert.ok(match, `index.html should embed ${id}`);
  return match[1];
}

async function runInMemoryPath(source, bytes) {
  const messages = [];
  const context = { console, TextDecoder, self: { postMessage: (m) => messages.push(m), addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  await context.self.onmessage({ data: {
    kind: "parse-csv",
    fileName: "sample.csv",
    fileSize: bytes.byteLength,
    fileLastModified: 0,
    encoding: "auto",
    buffer: bytes.buffer,
  } });
  const done = messages.find((message) => message.type === "complete");
  assert.ok(done, "in-memory path should complete");
  return {
    headers: JSON.parse(JSON.stringify(done.result.headers)),
    rows: JSON.parse(JSON.stringify(done.result.rows)),
  };
}

function createFileLike(bytes, chunkSize) {
  return {
    name: "sample.csv",
    size: bytes.byteLength,
    lastModified: 0,
    slice: (start, end) => new Blob([bytes.slice(start, end)]),
    stream() {
      let offset = 0;
      return new ReadableStream({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
        },
      });
    },
  };
}

async function runLargeFilePath(source, bytes, chunkSize) {
  const messages = [];
  const context = { Blob, TextDecoder, Uint8Array, Uint32Array, self: { postMessage: (m) => messages.push(m) } };
  vm.createContext(context);
  vm.runInContext(source, context);
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createFileLike(bytes, chunkSize),
    fileKind: "CSV",
    encoding: "auto",
  } });
  const loaded = messages.find((message) => message.type === "loaded");
  assert.ok(loaded, "large-file path should load");
  let rows = [];
  if (loaded.result.rowCount) {
    const indices = Array.from({ length: loaded.result.rowCount }, (_, index) => index);
    await context.self.onmessage({ data: { kind: "get-rows", token: 1, indices } });
    rows = messages.filter((message) => message.type === "rows").at(-1).rows.map((entry) => entry.row);
  }
  return {
    headers: JSON.parse(JSON.stringify(loaded.result.headers)),
    rows: JSON.parse(JSON.stringify(rows)),
  };
}

function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// 专挑修复逻辑会插手的内容：未加引号的 JSON、跨行围栏、未闭合括号、公式、
// 反斜杠路径、引号未双写、引号内换行
function buildCase(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const int = (bound) => Math.floor(random() * bound);
  const cells = [
    () => `v${int(100)}`,
    () => "",
    () => `"quoted, ${int(50)}"`,
    () => `"say ""hi"" ${int(9)}"`,
    () => `{"a":${int(9)},"b":${int(9)}}`,
    () => `[${int(9)},${int(9)}]`,
    () => `[\n  "${int(9)}",\n  "x"\n]`,
    () => '```json\n{"t":"a, b"}\n```',
    () => `[TODO${int(9)}`,
    () => `=IF(A1 > 0, B${int(9)}, C1)`,
    () => `C:\\dir${int(9)}\\`,
    () => `"{"tags":["a","b"],"n":${int(9)}}"`,
    () => `"unterminated ${int(9)}`,
    () => `中文${int(99)}`,
    () => `a|b;c\t${int(9)}`,
    () => `"line1\nline2 ${int(9)}"`,
    () => `x"y${int(9)}`,
  ];

  const delimiter = pick([",", ",", ",", ";", "\t", "|"]);
  const eol = pick(["\n", "\n", "\r\n"]);
  const columns = 2 + int(4);
  const lines = [];
  if (random() < 0.15) lines.push(`导出说明 ${int(99)}`);
  lines.push(Array.from({ length: columns }, (_, index) => `h${index + 1}`).join(delimiter));
  for (let row = 0, total = 1 + int(6); row < total; row += 1) {
    const width = random() < 0.8 ? columns : Math.max(1, columns + (random() < 0.5 ? -1 : 1));
    lines.push(Array.from({ length: width }, () => pick(cells)()).join(delimiter));
  }
  return lines.join(eol) + (random() < 0.8 ? eol : "");
}

test("随机畸形 CSV 上两条路径的表头与数据保持一致", async () => {
  const csvSource = loadWorkerSource("csv-worker-source");
  const largeSource = loadWorkerSource("large-data-worker-source");
  const random = createRandom(20260816);
  const encoder = new TextEncoder();
  const mismatches = [];

  for (let round = 0; round < 150; round += 1) {
    const text = buildCase(random);
    const bytes = encoder.encode(text);
    // 分块大小取质数，顺带覆盖跨流分块边界
    const chunkSize = [1, 3, 17, 4093][round % 4];
    const inMemory = await runInMemoryPath(csvSource, bytes);
    const largeFile = await runLargeFilePath(largeSource, bytes, chunkSize);
    for (const key of ["headers", "rows"]) {
      const left = JSON.stringify(inMemory[key]);
      const right = JSON.stringify(largeFile[key]);
      if (left === right) continue;
      const trim = (value) => (value.length > 200 ? `${value.slice(0, 200)}…` : value);
      mismatches.push(
        `第 ${round} 组 / ${key} / 分块 ${chunkSize}\n    输入  : ${trim(JSON.stringify(text))}`
        + `\n    普通  : ${trim(left)}\n    大文件: ${trim(right)}`,
      );
      break;
    }
  }

  assert.deepEqual(mismatches, [], `两条解析路径结果不一致：\n  ${mismatches.join("\n  ")}`);
});
