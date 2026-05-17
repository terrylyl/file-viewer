# Concatenate Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concatenate-column workflow, editable/restorable column names, and natural table width for narrow tables.

**Architecture:** Keep the current single-file app pattern in `index.html`. Add a dedicated concatenate popover and small state helpers beside the existing add-column and header-filter flows. Extend the existing custom-column data model so concatenated columns can reuse the current custom-column deletion path.

**Tech Stack:** Plain HTML, CSS, browser DOM APIs, Node `node:test` contract tests.

---

### Task 1: Failing Contract Tests

**Files:**
- Modify: `tests/html-contract.test.mjs`

- [ ] **Step 1: Add failing tests for concatenate UI and logic hooks**

Add assertions for these DOM ids and functions: `concatenateColumnButton`, `concatenateColumnPopover`, `concatenateColumnNameInput`, `concatenateRows`, `addConcatenateRowButton`, `cancelConcatenateColumnButton`, `confirmConcatenateColumnButton`, `concatenateValidationStatus`, `openConcatenateColumnPopover`, `renderConcatenateRows`, `resolveConcatenateItems`, `buildConcatenatedValue`, `addConcatenatedColumn`.

- [ ] **Step 2: Add failing tests for column rename and natural width**

Add assertions for these ids and functions: `renameColumnInput`, `renameColumnButton`, `restoreColumnNameButton`, `originalHeaders`, `renameColumn`, `restoreColumnName`. Add a CSS contract that `.grid-canvas` does not contain `min-width: 100%`.

- [ ] **Step 3: Run tests to verify red**

Run: `npm.cmd test`

Expected: FAIL because the new DOM ids and functions do not exist yet.

### Task 2: UI Markup And Styles

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add toolbar entry**

Add a `拼接列` button next to `新增列`:

```html
<button id="concatenateColumnButton" disabled>拼接列</button>
```

- [ ] **Step 2: Add concatenate popover markup**

Add a popover after `addColumnPopover` with output-name input, row container, validation status, and actions using the ids from Task 1.

- [ ] **Step 3: Add header rename controls**

Add rename input and buttons inside `columnFilterPopover`:

```html
<div class="filter-rename">
  <input id="renameColumnInput" type="text" placeholder="列名" />
  <button id="renameColumnButton">重命名列</button>
  <button id="restoreColumnNameButton">恢复原始列名</button>
</div>
```

- [ ] **Step 4: Add focused CSS**

Add compact styles for concatenate rows, drag handles, validation text, and rename controls. Remove `.grid-canvas { min-width: 100%; }` so inline `width: getTotalWidth()` controls natural width.

### Task 3: State And Pure Helpers

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Extend `els` and `state`**

Add DOM references for the new ids. Add `originalHeaders`, `concatenateColumnItems`, and `concatenateDragIndex` to state.

- [ ] **Step 2: Add helper functions**

Implement these functions:

```js
function getColumnOptionLabel(index) { ... }
function createDefaultConcatenateItem(columnIndex = 0) { ... }
function buildConcatenatedValue(items, row) { ... }
function resolveConcatenateItems(items) { ... }
function renameColumn(columnIndex, name) { ... }
function restoreColumnName(columnIndex) { ... }
```

`buildConcatenatedValue` must preserve:

````markdown
# alias
```markdown
content
```
````

- [ ] **Step 3: Update dataset mutations**

Initialize `originalHeaders` in `setDataset`. Append to `originalHeaders` in `addDerivedColumn` and new `addConcatenatedColumn`. Reindex `originalHeaders` in `deleteCustomColumn`.

### Task 4: Rendering And Events

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Render concatenate rows**

Implement `openConcatenateColumnPopover`, `closeConcatenateColumnPopover`, `renderConcatenateRows`, and drag/drop handlers for row order.

- [ ] **Step 2: Wire events**

Wire button clicks, add-row/delete-row actions, confirm action, rename action, and restore action. Ensure popovers close consistently when clicking outside or pressing Escape.

- [ ] **Step 3: Keep dependent UI in sync**

After adding, renaming, restoring, or deleting columns, refresh header, search column options, column overview, column popover, concatenate row options, detail metadata, and export headers through existing render/update functions.

### Task 5: Verification

**Files:**
- Modify: `README.md` if the implemented behavior changes the documented feature list.

- [ ] **Step 1: Run full tests**

Run: `npm.cmd test`

Expected: 0 failures.

- [ ] **Step 2: Run a status check**

Run: `git status --short --branch`

Expected: only intentional changes in `index.html`, `tests/html-contract.test.mjs`, optional `README.md`, and this plan file.
