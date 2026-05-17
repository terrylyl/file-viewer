# Concatenate Columns Design

## Context

The file viewer is a single-page local table application implemented in `index.html`. It already supports adding derived custom columns, deleting custom columns through the header menu, column filtering, column ordering, column width resizing, CSV export, and Excel import through optional SheetJS.

This design adds three related improvements:

- A dedicated concatenate-column workflow that creates one new custom column from multiple existing columns.
- Editable column headers for all columns, including original source columns, with per-column restore.
- Natural table width when there are only a few visible columns, leaving empty space to the right instead of stretching columns to fill the viewport.

## Goals

- Let users choose any number of source columns and concatenate their row values into one output column.
- Add the concatenated result as a new rightmost custom column while preserving all original columns.
- Preserve the exact Markdown fenced-code format in the generated cell value.
- Support both exact column selection and manual column-name matching for each source item.
- Prevent ambiguous or invalid manual column-name matches before creating the new column.
- Allow every column header to be renamed in the browser state and restored individually to its original loaded name.
- Keep table columns at their configured widths when total width is smaller than the viewport.

## Non-Goals

- The feature does not modify source files on disk.
- The feature does not add formula editing or arbitrary templates beyond the fixed Markdown format.
- The feature does not support global "restore all column names" in this iteration.
- The feature does not delete or hide source columns after concatenation.
- The feature does not persist rename or concatenate settings to localStorage.

## User Experience

The top toolbar gets a new `拼接列` button next to `新增列`. It is disabled until a dataset is loaded.

Clicking `拼接列` opens a dedicated popover panel. The panel contains:

- Output column name input, defaulting to `用户问题`.
- A list of concatenate rows.
- Each row has:
  - A drag handle for reordering.
  - A source-column dropdown showing column index plus current column name.
  - A manual column-name input for typed matching.
  - An alias input.
  - A delete button.
- An `添加拼接项` action to append another row.
- `取消` and `生成拼接列` actions.
- A validation area for row-specific errors.

The default initial state contains one concatenate row. Each row's alias defaults to the selected source column's current column name. Users can change the alias manually. Reordering rows changes the output block order.

When users confirm, the app appends a new rightmost custom column. The new column name defaults to `用户问题`, or uses the user's output-name input. It is tracked as a custom column, so the existing `删除此自定义列` action can remove it.

## Concatenation Format

For each selected source item, the generated text block is:

````markdown
# 别名
```markdown
被拼接列对应的内容
```
````

When multiple source items are configured, blocks are joined with one blank line. The triple backtick fence is part of the generated cell content and must be preserved exactly. Empty source cell values still generate an empty fenced block.

Example for three source columns:

````markdown
# 别名a
```markdown
内容a
```

# 别名b
```markdown
内容b
```

# 别名c
```markdown
内容c
```
````

## Column Selection And Validation

Each concatenate row can resolve a source column in two ways:

- Dropdown selection: always precise, including duplicate column names.
- Manual name input: matches against current column names.

Manual input validation rules:

- Empty manual input is allowed only if the dropdown has a valid selected column.
- If manual input matches no column, confirmation is blocked.
- If manual input matches more than one column, confirmation is blocked and the user must use the dropdown.
- If manual input matches exactly one column, that resolved column is used.

This preserves flexibility while preventing duplicate-column ambiguity.

## Column Rename And Restore

All columns can be renamed, including original source columns, derived custom columns, and concatenated custom columns.

The header filter menu gets rename controls:

- A column-name input initialized with the current column name.
- A `重命名列` action that updates only the browser state.
- A `恢复原始列名` action that restores only the active column to its dataset-load name.

The app stores both:

- `headers`: current editable column names.
- `originalHeaders`: names as loaded or generated when the column was first created.

For original file columns, `originalHeaders` comes from the loaded CSV or Excel sheet. For custom columns, `originalHeaders` is the name used when the custom column is created. Renaming affects search-column labels, column overview, header titles, export headers, issue report column names where applicable, and concatenate dropdown labels.

## Natural Table Width

The grid width continues to be calculated as:

- row-number width
- plus the sum of visible column widths

If this total is less than the viewport width, the grid keeps that natural width and stays left aligned. No visible column is stretched to fill unused horizontal space. Existing column resize behavior continues to update individual column widths.

## Data Model Changes

Add state fields:

- `originalHeaders: []`
- `concatenateColumnItems`: current rows shown in the open concatenate popover
- `concatenateDragIndex`: source row index while dragging concatenate rows

Update existing dataset setup:

- `setDataset(result)` initializes `headers` and `originalHeaders` from the loaded result headers.
- `addDerivedColumn(...)` appends to both `headers` and `originalHeaders`.
- New `addConcatenatedColumn(...)` appends to both `headers` and `originalHeaders`, tracks the new index in `customColumns`, updates rows, column order, visibility, widths, search options, and the grid.
- `deleteCustomColumn(...)` reindexes `originalHeaders` along with headers, filters, visibility, order, metadata, selection, and custom column tracking.

## Testing Plan

Add tests before implementation:

- HTML contract checks for the new `拼接列` button, concatenate popover fields, row list, add-row action, confirm action, and validation status.
- HTML contract checks for functions such as `openConcatenateColumnPopover`, `renderConcatenateRows`, `resolveConcatenateItems`, `buildConcatenatedValue`, and `addConcatenatedColumn`.
- HTML contract checks for rename functions such as `renameColumn`, `restoreColumnName`, and `originalHeaders`.
- Contract checks that the generated format includes `# alias`, a ` ```markdown ` fence, cell content, and closing triple backticks.
- Contract checks that natural table width logic does not stretch to viewport width.
- Existing CSV Worker tests remain unchanged unless parsing behavior is affected, which is not expected.

Run verification with `npm.cmd test` on Windows PowerShell because `npm test` can be blocked by script execution policy.

## Acceptance Criteria

- A loaded table exposes a `拼接列` action.
- Users can configure any number of source rows, reorder them, delete them, and add new rows.
- Dropdown source selection handles duplicate column names precisely.
- Manual column-name input blocks confirmation when no column or multiple columns match.
- Confirming creates one new rightmost custom column with default name `用户问题`.
- Generated cells preserve the exact Markdown fenced-code-block format.
- Source columns remain visible and unchanged after concatenation.
- The concatenated custom column can be deleted with the existing custom-column delete flow.
- Any column can be renamed from the header menu.
- Any column can be restored individually to its original loaded or generated name.
- CSV export uses current column names.
- When total visible column width is narrower than the grid viewport, columns remain naturally sized and left aligned.
