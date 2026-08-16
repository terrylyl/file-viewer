import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const templatePath = "index.template.html";
const outputPath = "index.html";

const sources = {
  css: "src/styles.css",
  sharedColumnProfile: "src/shared/column-profile.js",
  sharedFilters: "src/shared/filters.js",
  sharedIssues: "src/shared/issues.js",
  sharedCsvUtils: "src/shared/csv-utils.js",
  sharedExcelUtils: "src/shared/excel-utils.js",
  app: [
    "src/app/state.js",
    "src/app/file-io.js",
    "src/app/filtering.js",
    "src/app/profile.js",
    "src/app/table.js",
    "src/app/editing.js",
    "src/app/columns.js",
    "src/app/import.js",
    "src/app/export.js",
    "src/app/main.js",
  ],
  csvWorker: "src/workers/csv-worker.js",
  queryWorker: "src/workers/query-worker.js",
  largeDataWorker: "src/workers/large-data-worker.js",
  excelWorker: "src/workers/excel-worker.js",
  sheetJs: "vendor/xlsx.full.min.js",
};

const SHEETJS_SHA256 = "c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99";

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
}

function indentBlock(text, prefix) {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : ""))
    .join("\n");
}

async function readSource(path) {
  return normalizeNewlines(await readFile(path, "utf8"));
}

function composeSource(...parts) {
  return parts.filter(Boolean).join("\n\n");
}

const [
  template,
  css,
  sharedColumnProfile,
  sharedFilters,
  sharedIssues,
  sharedCsvUtils,
  sharedExcelUtils,
  appSources,
  csvWorker,
  queryWorkerSource,
  largeDataWorkerSource,
  excelWorkerSource,
] = await Promise.all([
  readFile(templatePath, "utf8"),
  readSource(sources.css),
  readSource(sources.sharedColumnProfile),
  readSource(sources.sharedFilters),
  readSource(sources.sharedIssues),
  readSource(sources.sharedCsvUtils),
  readSource(sources.sharedExcelUtils),
  Promise.all(sources.app.map(readSource)),
  readSource(sources.csvWorker),
  readSource(sources.queryWorker),
  readSource(sources.largeDataWorker),
  readSource(sources.excelWorker),
]);

const app = composeSource(sharedColumnProfile, sharedFilters, sharedIssues, sharedCsvUtils, sharedExcelUtils, ...appSources);
const csvWorkerSource = composeSource(sharedIssues, sharedCsvUtils, csvWorker);
const queryWorker = composeSource(sharedColumnProfile, sharedFilters, queryWorkerSource);
const largeDataWorker = composeSource(sharedColumnProfile, sharedFilters, sharedCsvUtils, largeDataWorkerSource);

const sheetJs = await readFile(sources.sheetJs, "utf8");
const sheetJsHash = createHash("sha256").update(sheetJs).digest("hex");
if (sheetJsHash !== SHEETJS_SHA256) {
  throw new Error(`SheetJS integrity check failed: expected ${SHEETJS_SHA256}, received ${sheetJsHash}.`);
}
const excelWorker = composeSource(sheetJs, sharedIssues, sharedExcelUtils, excelWorkerSource);
const inlineApp = indentBlock(app, "      ");
const inlineAppHash = createHash("sha256")
  .update(`\n${inlineApp}\n    `)
  .digest("base64");
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'sha256-${inlineAppHash}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "worker-src blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const html = template
  .replace("/*__INLINE_CSS__*/", indentBlock(css, "      "))
  .replace("/*__CSV_WORKER__*/", csvWorkerSource)
  .replace("/*__QUERY_WORKER__*/", queryWorker)
  .replace("/*__LARGE_DATA_WORKER__*/", largeDataWorker)
  .replace("/*__EXCEL_WORKER__*/", () => excelWorker)
  .replace("/*__APP_JS__*/", inlineApp)
  .replace("/*__CSP__*/", contentSecurityPolicy);

const placeholders = [
  "/*__INLINE_CSS__*/",
  "/*__CSV_WORKER__*/",
  "/*__QUERY_WORKER__*/",
  "/*__LARGE_DATA_WORKER__*/",
  "/*__EXCEL_WORKER__*/",
  "/*__APP_JS__*/",
  "/*__CSP__*/",
];

const remainingPlaceholders = placeholders.filter((placeholder) => html.includes(placeholder));
if (remainingPlaceholders.length) {
  throw new Error(`Build failed: unreplaced placeholders remain: ${remainingPlaceholders.join(", ")}`);
}

await writeFile(outputPath, html.endsWith("\n") ? html : `${html}\n`);
console.log(`Built ${outputPath} from split sources.`);
