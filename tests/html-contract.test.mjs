import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("index.html contains the required application regions", () => {
  for (const id of [
    "dropZone",
    "fileInput",
    "gridViewport",
    "headerRow",
    "rowLayer",
    "detailPanel",
    "searchInput",
    "exportCsvButton",
    "csv-worker-source",
    "columnFilterPopover",
    "columnFilterSearchInput",
    "columnFilterValues",
    "columnOverview",
    "clearAllFiltersButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("application script exposes Excel-like header filtering behavior", () => {
  assert.match(html, /columnFilters/, "missing column filter state");
  assert.match(html, /openColumnFilterMenu/, "missing header filter menu opener");
  assert.match(html, /rowPassesColumnFilters/, "missing row filter predicate");
  assert.match(html, /renderColumnFilterValues/, "missing filter value renderer");
  assert.match(html, /clearAllFilters/, "missing global clear filters action");
  assert.match(html, /renderColumnOverview/, "missing column overview renderer");
});

test("file import button is protected from wrapping in the compact header", () => {
  assert.match(html, /#chooseFileButton\s*{[\s\S]*?white-space:\s*nowrap/, "choose file button should not wrap");
});

test("inline application script parses", () => {
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  const applicationScripts = scripts
    .filter((match) => !match[0].includes('type="text/plain"'))
    .map((match) => match[1].trim())
    .filter(Boolean);

  assert.ok(applicationScripts.length >= 1, "expected at least one application script");
  for (const script of applicationScripts) {
    assert.doesNotThrow(() => new Function(script));
  }
});
