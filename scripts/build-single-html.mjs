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
  excelWorker: "src/workers/excel-worker.js",
};

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
  readSource(sources.excelWorker),
]);

const app = composeSource(sharedColumnProfile, sharedFilters, sharedIssues, sharedCsvUtils, sharedExcelUtils, ...appSources);
const queryWorker = composeSource(sharedColumnProfile, sharedFilters, queryWorkerSource);
const excelWorker = composeSource(sharedIssues, sharedExcelUtils, excelWorkerSource);

const html = template
  .replace("/*__INLINE_CSS__*/", indentBlock(css, "      "))
  .replace("/*__CSV_WORKER__*/", csvWorker)
  .replace("/*__QUERY_WORKER__*/", queryWorker)
  .replace("/*__EXCEL_WORKER__*/", excelWorker)
  .replace("/*__APP_JS__*/", indentBlock(app, "      "));

const placeholders = [
  "/*__INLINE_CSS__*/",
  "/*__CSV_WORKER__*/",
  "/*__QUERY_WORKER__*/",
  "/*__EXCEL_WORKER__*/",
  "/*__APP_JS__*/",
];

if (placeholders.some((placeholder) => html.includes(placeholder))) {
  throw new Error("Build failed: unreplaced placeholders remain in the HTML template.");
}

await writeFile(outputPath, html.endsWith("\n") ? html : `${html}\n`);
console.log(`Built ${outputPath} from split sources.`);
