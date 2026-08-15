import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// 差分模糊测试：随机生成**合法** CSV，与严格 RFC4180 参照实现逐字段比对。
// 固定语料只能防住已知形态，这里防的是组合爆炸——这一轮线上暴露的解析 bug
// （引号内 `\"` 吞掉收尾引号并把下一行并进来、反斜杠吃掉分隔符）都能被它抓到。
//
// 种子固定，失败可复现；失败时会把用例最小化后打印出来。

function loadParser() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script id="csv-worker-source" type="text\/plain">([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html should embed csv-worker-source");
  const context = { console, TextDecoder, self: { postMessage() {}, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return context;
}

// 严格 RFC4180 参照实现，等价于 Python csv 模块的默认设置
function referenceParse(text) {
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; started = true; continue; }
    if (ch === ",") { record.push(field); field = ""; started = true; continue; }
    if (ch === "\n") { record.push(field); records.push(record); record = []; field = ""; started = false; continue; }
    if (ch === "\r") continue;
    field += ch;
    started = true;
  }
  if (started || field.length || record.length) { record.push(field); records.push(record); }
  return records;
}

// 只生成合法 CSV：需要时加引号并把内部引号双写
const encodeCell = (value) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const buildCsv = (cells, columns) => {
  const rows = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
  return `${rows.map((row) => row.map(encodeCell).join(",")).join("\n")}\n`;
};

// 专挑宽容解析会插手的字符：引号、反斜杠、括号、反引号、换行
const ATOMS = [
  "[", "]", "{", "}", '"', "\\", ",", "\n", "`", "'", ":", " ", "\t",
  "a", "1", "中", "true", "null", "```", "\\n", "\\t", '\\"', '""', "[]", "{}",
];

function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function createGenerator(seed, atoms = ATOMS) {
  const random = createRandom(seed);
  const pick = (items) => items[Math.floor(random() * items.length)];
  return {
    cell() {
      const length = 1 + Math.floor(random() * 10);
      let text = "";
      for (let i = 0; i < length; i += 1) text += pick(atoms);
      return text;
    },
    columns: () => 2 + Math.floor(random() * 3),
    // 行数取 5–10：列数一致性是所有安全网的判据，只有两三行时证据不足，
    // 得到的偏差不能代表真实文件（真实 CSV 动辄成百上千行）。
    rows: () => 5 + Math.floor(random() * 6),
  };
}

// 逐格删减 + 逐字符删减，把失败用例缩到最小
// minRows：最小化时保留的记录数下限。列数一致性检查要先有一条记录立住表头列数，
// 缩到单条记录会得到一个安全网全部失效的退化用例，对定位没有帮助。
function shrink(cells, columns, fails, minRows = 1) {
  let best = cells;
  for (let pass = 0; pass < 40; pass += 1) {
    let improved = false;
    for (let index = 0; index + columns <= best.length && best.length > columns * minRows; index += columns) {
      const trial = best.slice(0, index).concat(best.slice(index + columns));
      if (trial.length && fails(trial)) { best = trial; improved = true; break; }
    }
    if (improved) continue;
    for (let index = 0; index < best.length; index += 1) {
      const cell = best[index];
      let shrunk = false;
      for (let k = 0; k < cell.length; k += 1) {
        const trial = best.slice();
        trial[index] = cell.slice(0, k) + cell.slice(k + 1);
        if (fails(trial)) { best = trial; shrunk = true; break; }
      }
      if (shrunk) { improved = true; break; }
    }
    if (!improved) break;
  }
  return best;
}

function describe(cells, columns, actual, expected) {
  return [
    `CSV : ${JSON.stringify(buildCsv(cells, columns))}`,
    `应为: ${JSON.stringify(expected)}`,
    `实际: ${JSON.stringify(actual)}`,
  ].join("\n  ");
}

const ITERATIONS = 1500;

test("严格模式逐字段等价于 RFC4180 参照实现", () => {
  const context = loadParser();
  const generator = createGenerator(20260809);

  const mismatch = (cells, columns) => {
    const csv = buildCsv(cells, columns);
    const parser = context.createCsvRecordParser(",", { strict: true });
    const actual = [...parser.push(csv), ...parser.finish()];
    const expected = referenceParse(csv);
    return JSON.stringify(actual) === JSON.stringify(expected) ? null : { actual, expected };
  };

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const columns = generator.columns();
    const cells = Array.from({ length: columns * generator.rows() }, generator.cell);
    const diff = mismatch(cells, columns);
    if (!diff) continue;
    const minimal = shrink(cells, columns, (trial) => Boolean(mismatch(trial, columns)));
    const minimalDiff = mismatch(minimal, columns) || diff;
    assert.fail(`严格模式与 RFC4180 不一致：\n  ${describe(minimal, columns, minimalDiff.actual, minimalDiff.expected)}`);
  }
});

test("宽容模式不会吞掉合法 CSV 的记录边界", () => {
  const context = loadParser();
  // 取值域限定在 RFC 核心字符：引号、反斜杠、换行、分隔符。
  // 结构化模式（`[` / `{`）和 Markdown 围栏会**有意**跨行合并物理行——那是它们
  // 存在的理由——由 csv-worker-core、delimiter-corpus 等定向用例覆盖，
  // 放进这条性质只会得到设计意图本身。线上真正丢行的两个 bug（引号内 `\"`
  // 吃掉收尾引号、反斜杠吃掉分隔符）都落在这个取值域里。
  const STRUCTURE_ATOMS = new Set(["```", "[", "]", "{", "}", "[]", "{}"]);
  const generator = createGenerator(981119, ATOMS.filter((atom) => !STRUCTURE_ATOMS.has(atom)));

  // 宽容模式允许把多个字段合成一个（未加引号的 JSON、围栏就是这么兜住的），
  // 但绝不允许记录数变少——那正是线上 201 行读成 141 行的形态。
  // 表头列数是所有安全网的判据，因此只对至少两条记录的输入成立。
  const mismatch = (cells, columns) => {
    const csv = buildCsv(cells, columns);
    const expected = referenceParse(csv);
    if (expected.length < 2) return null;
    const parser = context.createCsvRecordParser(",");
    const actual = [...parser.push(csv), ...parser.finish()];
    return actual.length === expected.length ? null : { actual, expected };
  };

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const columns = generator.columns();
    const cells = Array.from({ length: columns * generator.rows() }, generator.cell);
    const diff = mismatch(cells, columns);
    if (!diff) continue;
    const minimal = shrink(cells, columns, (trial) => Boolean(mismatch(trial, columns)), 2);
    const minimalDiff = mismatch(minimal, columns) || diff;
    assert.fail(
      `宽容模式记录数与 RFC4180 不一致（${minimalDiff.actual.length} vs ${minimalDiff.expected.length}）：\n  `
      + describe(minimal, columns, minimalDiff.actual, minimalDiff.expected),
    );
  }
});
