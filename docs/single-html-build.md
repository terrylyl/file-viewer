# Single HTML Build

本项目现在支持“开发态多文件、交付态单文件”的轻拆分模式。

## What Changed

开发维护时可以编辑这些源码文件：

```text
src/styles.css
src/shared/column-profile.js
src/shared/filters.js
src/shared/issues.js
src/shared/csv-utils.js
src/app/state.js
src/app/file-io.js
src/app/filtering.js
src/app/profile.js
src/app/table.js
src/app/editing.js
src/app/columns.js
src/app/import.js
src/app/export.js
src/app/main.js
src/workers/csv-worker.js
src/workers/query-worker.js
src/workers/excel-worker.js
```

`index.template.html` 是单页模板，包含内联占位符。

运行：

```bash
npm run build
```

会把 `src/` 中的源码重新内联生成最终的：

```text
index.html
```

其中 `src/shared/*.js` 会按需前置到主线程脚本和 Worker 脚本中；这些文件应保持为无 DOM、无模块语法、无副作用的纯函数集合。

最终分发仍然只需要发送构建后的 `index.html`。

## Development Flow

1. 修改 `src/...` 源文件。
2. 运行 `npm run build` 生成 `index.html`。
3. 运行 `npm test` 验证生成后的单页产物。
4. 运行 `npm run dev` 或直接分发 `index.html`。

## Rollback Plan

如果这个轻拆分模式不符合预期，可以回退到旧的“只维护 `index.html`”模式。

需要移除：

```text
index.template.html
src/
scripts/build-single-html.mjs
docs/single-html-build.md
```

并从 `package.json` 删除：

```json
"build": "node scripts/build-single-html.mjs"
```

保留当前已经生成好的 `index.html` 即可继续直接运行和分发。

如果使用 Git，推荐回退命令是按文件精确恢复，而不是全仓库 reset：

```bash
git restore index.template.html src scripts/build-single-html.mjs docs/single-html-build.md package.json
```

如果这些文件已经被提交，则用一次普通 revert commit 回退该提交即可。

## Important Notes

- `index.html` 是生成物，也是最终单文件分发物。
- `src/` 是维护源码，不需要发给最终使用者。
- 这个方案没有引入 bundler；构建脚本只是读取文件并做文本内联。
- 构建脚本会校验所有模板占位符都被替换，避免生成缺少 Worker 或主脚本的半成品。
- 修改 `index.html` 后再运行 `npm run build` 会被 `src/` 重新覆盖，所以后续维护应优先修改 `src/`。
