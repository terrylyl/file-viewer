import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// 同一份文件，24 MiB 以下走普通路径、以上走大文件字节索引器。两套解析器各自
// 手写、各自演化，这一轮至少四个 bug 是它们不一致造成的：公式修复只在普通路径、
// 反斜杠规则不同步、表头行判定不同、空记录过滤口径不一致。
//
// 这里逐形态比对两条路径的最终结果（编码、分隔符、表头、每一行、告警类型）。
// 只要有一边改了行为而另一边没跟上，这个测试就会红。
//
// 两条路径都走真实入口：普通路径收 ArrayBuffer（和 app 一样先解码），
// 大文件路径收 File，因此编码识别、分隔符探测、表头识别全都在比对范围内。

function loadWorkerSource(id) {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(new RegExp(`<script id="${id}" type="text/plain">([\\s\\S]*?)</script>`));
  assert.ok(match, `index.html should embed ${id}`);
  return match[1];
}

async function runInMemoryPath(bytes) {
  const messages = [];
  const context = { console, TextDecoder, self: { postMessage: (m) => messages.push(m), addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(loadWorkerSource("csv-worker-source"), context);
  await context.self.onmessage({ data: {
    kind: "parse-csv",
    fileName: "sample.csv",
    fileSize: bytes.byteLength,
    fileLastModified: 0,
    encoding: "auto",
    previewLimit: 500,
    longFieldThreshold: 50000,
    buffer: bytes.buffer,
  } });
  const done = messages.find((message) => message.type === "complete");
  assert.ok(done, "in-memory path should complete");
  return {
    encoding: done.result.file.encoding,
    delimiter: done.result.file.delimiter,
    headers: JSON.parse(JSON.stringify(done.result.headers)),
    rows: JSON.parse(JSON.stringify(done.result.rows)),
    issues: done.result.issues.inconsistentRows.map((issue) => issue.type).sort(),
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

async function runLargeFilePath(bytes, chunkSize) {
  const messages = [];
  const context = { Blob, TextDecoder, Uint8Array, Uint32Array, self: { postMessage: (m) => messages.push(m) } };
  vm.createContext(context);
  vm.runInContext(loadWorkerSource("large-data-worker-source"), context);
  await context.self.onmessage({ data: {
    kind: "load-large-file",
    file: createFileLike(bytes, chunkSize),
    fileKind: "CSV",
    encoding: "auto",
    previewLimit: 500,
    longFieldThreshold: 50000,
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
    encoding: loaded.result.file.encoding,
    delimiter: loaded.result.file.delimiter,
    headers: JSON.parse(JSON.stringify(loaded.result.headers)),
    rows: JSON.parse(JSON.stringify(rows)),
    issues: loaded.result.issues.inconsistentRows.map((issue) => issue.type).sort(),
  };
}

const utf8 = (text) => new TextEncoder().encode(text);
const gb18030 = (...parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === "string") out.push(...utf8(part));
    else out.push(...part);
  }
  return new Uint8Array(out);
};
const markdownTable = (rows) => Array.from({ length: rows }, (_, i) => `| 列A${i} | 列B${i} |`).join("\n");

const SHAPES = [
  ["逗号基本表", utf8("a,b,c\n1,2,3\n4,5,6\n")],
  ["分号表", utf8("id;name;age\n1;a;2\n2;b;3\n")],
  ["竖线表", utf8("id|name|age\n1|a|2\n")],
  ["TSV", utf8("id\tname\tage\n1\ta\t2\n")],
  ["CRLF", utf8("id;name;age\r\n1;a;2\r\n")],
  ["老式 \\r 换行", utf8("id;name;age\r1;a;2\r2;b;3\r")],
  ["BOM + 分号表", utf8("﻿id;name;age\n1;a;2\n")],
  ["BOM + 逗号表", utf8("﻿id,name,age\n1,a,2\n")],
  ["标题行 + 分号表", utf8("月度报表\nid;name;age\n1;张三;20\n2;李四;30\n")],
  ["前言两行 + TSV", utf8("导出时间: 2026\n数据来源: XX\nid\tname\tage\n1\ta\t2\n")],
  ["前导空行", utf8("\nid,name,age\n1,a,2\n")],
  [",, 占位行", utf8(",,\nid,name,age\n1,a,2\n")],
  ["中间空行", utf8("id,name\n1,a\n\n2,b\n")],
  ["单行无换行", utf8("id;name;age")],
  ["公式含逗号", utf8("id,formula,result\n1,=IF(A1 > 0, B1, C1),ok\n2,=SUM(A2, B2),done\n")],
  ["公式在末列", utf8("id,formula\n1,=IF(A1 > 0, B1, C1)\n2,plain\n")],
  ["Windows 路径未加引号", utf8("path,next\nC:\\data\\,2024\nb,3\n")],
  // 加了引号的 `\` + 分隔符是一个完整字段，两条路径都不该按行短就把它拆开
  ["Windows 路径加引号且行偏短", utf8('path,next\n"C:\\data\\,2024"\nb,3\n')],
  ["引号内换行", utf8('id,note\n1,"line1\nline2"\n2,ok\n')],
  ["引号内双写", utf8('id,note\n1,"say ""hi"", ok"\n2,b\n')],
  ["引号空 cell", utf8('id,a,b\n1,"",x\n')],
  ["未加引号 JSON", utf8('id,payload,tag\n1,{"a":1,"b":2},x\n2,ok,y\n')],
  ["未加引号 JSON 在末列", utf8('id,tag,payload\n1,x,{"a":1,"b":2}\n2,y,ok\n')],
  ["跨行 pretty-print JSON", utf8('id,payload,tag\n1,[\n\t"A",\n\t"B"\n],x\n2,ok,y\n')],
  ["未闭合中括号", utf8("name,note,tag\nalice,[2024上半年,a\nbob,ok,b\n")],
  ["Markdown 围栏", utf8('id,name,note\n1,a,```json\n{"t":"one, two"}\n```\n2,b,after\n')],
  ["md 表格未加引号", utf8(`id,note,tag\n1,${markdownTable(20)},x\n2,ok,y\n`)],
  ["tags 列竖线", utf8("id,tags\n1,a|b|c|d|e\n2,f|g|h|i|j\n")],
  ["重复列名", utf8("id,name,name\n1,a,b\n")],
  ["列数不一致", utf8("a,b,c\n1,2,3\n4,5\n6,7,8,9\n")],
  ["行尾多分隔符", utf8("a,b,c\n1,2,3,\n4,5,6,\n")],
  ["空字段比例高", utf8("a,b,c,d,e\n1,,,,\n2,x,y,z,w\n")],
  ["末尾无换行", utf8("a,b\n1,2")],
  ["只有表头", utf8("id;name;age\n")],
  ["单列文件", utf8("name\na\nb\n")],
  ["空文件", utf8("")],
  ["只有空行", utf8("\n\n\n")],
  ["四行前言(超出跳过上限)", utf8("报表\n说明一\n说明二\n说明三\nid;name;age\n1;a;2\n")],
  ["纯 Markdown 表格文件", utf8("| id | name |\n| --- | --- |\n| 1 | 张三 |\n")],
  ["GB18030 中文", gb18030("id,", [0xb1, 0xb8, 0xd7, 0xa2], "\n1,", [0xd6, 0xd0, 0xce, 0xc4], "\n")],
  ["GB18030 次字节 0x5C", gb18030("id,name\n1,", [0xba, 0x5c], ",x\n")],
  ["未闭合引号", utf8('id,note\n1,"未闭合\n2,ok\n')],
  ["截断 JSON 到文件末尾", utf8('id,payload,note\n1,{"tags":["a","b"],unfinished')],
  ["超长 cell", utf8(`id,note\n1,${"x".repeat(60000)}\n2,ok\n`)],
];

test("普通路径与大文件路径逐形态结果一致", async () => {
  const mismatches = [];

  for (const [name, bytes] of SHAPES) {
    // 分块大小取质数，顺带覆盖跨流分块边界
    const [inMemory, largeFile] = [await runInMemoryPath(bytes), await runLargeFilePath(bytes, 17)];
    for (const key of ["encoding", "delimiter", "headers", "rows", "issues"]) {
      const left = JSON.stringify(inMemory[key]);
      const right = JSON.stringify(largeFile[key]);
      if (left === right) continue;
      const trim = (value) => (value && value.length > 160 ? `${value.slice(0, 160)}…` : value);
      mismatches.push(`${name} / ${key}\n    普通  : ${trim(left)}\n    大文件: ${trim(right)}`);
    }
  }

  assert.deepEqual(mismatches, [], `两条解析路径结果不一致：\n  ${mismatches.join("\n  ")}`);
});
