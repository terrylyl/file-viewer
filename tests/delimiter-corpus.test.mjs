import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// 分隔符探测的回归语料。探测逻辑在 2.3.4 / 2.3.7 / 2.3.8 之间翻过三次，
// 每次都因为只对着手头那个 case 验证而打坏另一类文件。任何评分改动都要整表跑通这里。
//
// pending 字段 = 已知失败、留给第 2 组（放宽首记录硬淘汰 + 空首尾字段降权）的用例：
// 断言按 current 走，等第 2 组落地后这里会红，届时删掉 current/pending 即可。

function loadWorkerCore() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="csv-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed csv-worker-source");
  const context = { console, TextDecoder, self: { postMessage() {}, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return context;
}

const mdTable = (rows) => Array.from({ length: rows }, (_, i) => `| 列A${i} | 列B${i} | 列C${i} |`).join("\n");

const CORPUS = [
  // ---- 四种分隔符的正常形态 ----
  { name: "逗号基本表", input: "a,b,c\n1,2,3\n4,5,6\n", delimiter: ",", columns: 3 },
  { name: "分号基本表", input: "id;name;age\n1;a;2\n2;b;3\n", delimiter: ";", columns: 3 },
  { name: "竖线基本表", input: "id|name|age\n1|a|2\n2|b|3\n", delimiter: "|", columns: 3 },
  { name: "TSV 基本表", input: "id\tname\tage\n1\ta\t2\n", delimiter: "\t", columns: 3 },
  { name: "CRLF 分号表", input: "id;name;age\r\n1;a;2\r\n2;b;3\r\n", delimiter: ";", columns: 3 },
  { name: "老式 \\r 分号表", input: "id;name;age\r1;a;2\r2;b;3\r", delimiter: ";", columns: 3 },
  { name: "表头整体加引号(分号)", input: '"id";"name";"age"\n1;a;2\n', delimiter: ";", columns: 3 },
  { name: "BOM + 分号表", input: "﻿id;name;age\n1;a;2\n", delimiter: ";", columns: 3 },

  // ---- 退化输入 ----
  { name: "单列文件", input: "name\na\nb\n", delimiter: ",", columns: 1 },
  { name: "空文件", input: "", delimiter: ",", columns: 0 },
  { name: "只有空行", input: "\n\n\n", delimiter: ",", columns: 0 },

  // ---- 结尾无换行（1.2：完整样本才 finish）----
  { name: "单行无换行(分号)", input: "id;name;age", delimiter: ";", columns: 3 },
  { name: "单行无换行(竖线)", input: "id|name|age", delimiter: "|", columns: 3 },
  { name: "单行无换行(TSV)", input: "id\tname\tage", delimiter: "\t", columns: 3 },
  { name: "两行无换行(分号)", input: "id;name;age\n1;a;2", delimiter: ";", columns: 3 },
  { name: "空列名表头无换行(分号)", input: ";;;\n1;a;2;3", delimiter: ";", columns: 4 },

  // ---- 前导空记录（1.1：不能顶替表头）----
  { name: "前导 1 空行(逗号)", input: "\nid,name,age\n1,a,2\n", delimiter: ",", columns: 3, headers: ["id", "name", "age"] },
  { name: "前导 2 空行(逗号)", input: "\n\nid,name,age\n1,a,2\n", delimiter: ",", columns: 3, headers: ["id", "name", "age"] },
  { name: "首行 ,, 占位(逗号)", input: ",,\nid,name,age\n1,a,2\n", delimiter: ",", columns: 3, headers: ["id", "name", "age"] },
  { name: "首行 ;; 占位(分号)", input: ";;\nid;name;age\n1;a;2\n", delimiter: ";", columns: 3, headers: ["id", "name", "age"] },

  // ---- 正文误导：必须守住 ----
  { name: "md 表格未加引号(1 行数据)", input: `id,note,tag\n1,${mdTable(30)},x\n`, delimiter: ",", columns: 3 },
  { name: "md 表格未加引号(2 行数据)", input: `id,note,tag\n1,${mdTable(30)},x\n2,ok,y\n`, delimiter: ",", columns: 3 },
  { name: "md 表格加引号", input: `id,note,tag\n1,"${mdTable(30)}",x\n2,ok,y\n`, delimiter: ",", columns: 3 },
  { name: "tags 列全竖线", input: "id,tags\n1,a|b|c\n2,d|e|f\n3,g|h|i\n", delimiter: ",", columns: 2 },
  { name: "正文含大量分号", input: "id,note\n1,a;b;c;d\n2,e;f;g;h\n", delimiter: ",", columns: 2 },
  { name: "正文含大量制表符", input: "id,note\n1,a\tb\tc\td\n2,e\tf\tg\th\n", delimiter: ",", columns: 2 },
  { name: "表头某列含竖线(逗号)", input: "id,a|b,note\n1,x,y\n2,p,q\n", delimiter: ",", columns: 3 },
  { name: "表头某列含分号(逗号)", input: "id,a;b,note\n1,x,y\n2,p,q\n", delimiter: ",", columns: 3 },

  // ---- 标题行/前言行里含真分隔符：已经能过 ----
  { name: "Excel 风格标题行(分号)", input: "月度报表;;\nid;name;age\n1;a;2\n", delimiter: ";", columns: 3 },
  { name: "标题行含分号(分号表)", input: "报表;2026\nid;name;age\n1;a;2\n2;b;3\n", delimiter: ";", columns: 3 },
  { name: "标题行含制表符(TSV)", input: "报表\t2026\nid\tname\tage\n1\ta\t2\n", delimiter: "\t", columns: 3 },
  { name: "sep=; 指令行(分号表)", input: "sep=;\nid;name;age\n1;a;2\n", delimiter: ";", columns: 3 },
  { name: "前言行 + 逗号表", input: "导出时间: 2026-08-09\nid,name,age\n1,a,2\n", delimiter: ",", columns: 3 },
  { name: "无表头的分号数据", input: "1;a;2\n2;b;3\n3;c;4\n", delimiter: ";", columns: 3 },

  // ---- 标题行/前言行不含真分隔符：第 2 组才能修 ----
  {
    name: "标题行 + 空行 + 分号表",
    input: "月度报表\n\nid;name;age\n1;a;2\n2;b;3\n",
    delimiter: ";", columns: 3,
    current: { delimiter: ",", columns: 1 }, pending: "B1+B2",
  },
  {
    name: "标题行(含逗号) + 分号表",
    input: "报表：1月,2月\nid;name;age\n1;a;2\n2;b;3\n",
    delimiter: ";", columns: 3,
    current: { delimiter: ",", columns: 2 }, pending: "B1+B2",
  },
  {
    name: "前言两行 + TSV",
    input: "导出时间: 2026-08-09\n数据来源: XX\nid\tname\tage\n1\ta\t2\n",
    delimiter: "\t", columns: 3,
    current: { delimiter: ",", columns: 1 }, pending: "B1+B2",
  },
  {
    name: "# 注释行 + TSV",
    input: "# 导出说明\nid\tname\tage\n1\ta\t2\n",
    delimiter: "\t", columns: 3,
    current: { delimiter: ",", columns: 1 }, pending: "B1+B2",
  },
  {
    name: "说明行 + 竖线表",
    input: "月报\nid|name|age\n1|a|2\n",
    delimiter: "|", columns: 3,
    current: { delimiter: ",", columns: 1 }, pending: "B1+B2",
  },
  {
    name: "首记录是引号包住的多行 cell + 分号表",
    input: '"第一行\n第二行"\nid;name;age\n1;a;2\n',
    delimiter: ";", columns: 3,
    current: { delimiter: ",", columns: 1 }, pending: "B1+B2",
  },
];

test("delimiter corpus: detection and column count", () => {
  const core = loadWorkerCore().self.__CSV_CORE__;
  const failures = [];

  for (const entry of CORPUS) {
    const expected = entry.current || entry;
    const detected = core.detectDelimiter(entry.input);
    const parsed = core.parseCsvText(entry.input);
    if (detected !== expected.delimiter || parsed.headers.length !== expected.columns) {
      failures.push(
        `${entry.name}: 探测 ${JSON.stringify(detected)}/${parsed.headers.length} 列，` +
        `期望 ${JSON.stringify(expected.delimiter)}/${expected.columns} 列`,
      );
      continue;
    }
    if (entry.headers && !entry.current) {
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.headers)), entry.headers, entry.name);
    }
  }

  assert.deepEqual(failures, [], `分隔符语料回归：\n${failures.join("\n")}`);
});

test("delimiter corpus: pending cases are tracked, not silently accepted", () => {
  const pending = CORPUS.filter((entry) => entry.pending);
  // 第 2 组落地后这些用例会开始按 delimiter/columns 通过，届时删掉 current/pending 字段。
  assert.equal(pending.length, 6, "待修用例数量变化时请同步更新语料");
  for (const entry of pending) {
    assert.notDeepEqual(
      { delimiter: entry.current.delimiter, columns: entry.current.columns },
      { delimiter: entry.delimiter, columns: entry.columns },
      `${entry.name}: current 与期望相同就不该再标 pending`,
    );
  }
});

test("低置信度：整表塌成一列时给出分隔符告警", () => {
  const core = loadWorkerCore().self.__CSV_CORE__;
  const parsed = core.parseCsvText("月度报表\nid;name;age\n1;a;2\n2;b;3\n");

  assert.equal(parsed.headers.length, 1, "这个用例目前仍会塌成一列（待第 2 组修复）");
  const warning = parsed.issues.inconsistentRows.find((issue) => issue.type === "分隔符可能判断有误");
  assert.ok(warning, "塌成一列时必须给出告警，不能静默");
  assert.match(warning.detail, /分号/);
  assert.match(warning.detail, /3 列/);
});

test("低置信度：正常单列文件不应误报", () => {
  const core = loadWorkerCore().self.__CSV_CORE__;
  const parsed = core.parseCsvText("name\nalice\nbob\ncarol\n");

  assert.equal(parsed.headers.length, 1);
  assert.equal(parsed.issues.inconsistentRows.length, 0, "真正的单列文件不该报分隔符告警");
});

test("截断样本不调用 finish，完整样本才调用", () => {
  const context = loadWorkerCore();
  // 完整输入：末条无换行的记录要计入证据
  assert.equal(context.detectCsvDelimiter("id;name;age"), ";");
  // 调用方声明是截断样本：半截记录不能当完整证据，回到默认逗号
  assert.equal(context.detectCsvDelimiter("id;name;age", { truncated: true }), ",");
});
