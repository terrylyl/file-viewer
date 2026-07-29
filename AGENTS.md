# Repository Guidelines

## 项目结构与模块组织

本仓库是一个零依赖的本地表格文件查看器，源码会构建成单个可部署的 `index.html`。

- `index.template.html`：HTML 外壳，包含构建占位符。
- `src/styles.css`：应用样式。
- `src/app/main.js`：主线程应用逻辑、状态管理与界面交互。
- `src/workers/*.js`：CSV/JSONL、查询、Excel 等 Worker 逻辑。
- `index.html`：构建产物；通常不要手动修改，应改 `src/` 后重新构建。
- `scripts/build-single-html.mjs`：将样式、主逻辑和 Worker 内联到 `index.html`。
- `scripts/serve.mjs`：本地静态服务器。
- `tests/*.test.mjs`：Node 测试，覆盖解析行为和 HTML 契约。
- `docs/`：架构说明和历史功能设计文档。

## 构建、测试与本地开发

- `npm run build`：从拆分源码重新生成 `index.html`。
- `npm run dev`：先构建，再在 `http://127.0.0.1:4173` 启动本地服务。
- `npm test`：先构建，再运行全部 `node --test` 测试。
- `node scripts/serve.mjs`：不重新构建，直接服务当前文件。

如果 PowerShell 拦截 `npm.ps1`，使用 `npm.cmd run dev` 或 `npm.cmd test`。

## 代码风格与命名约定

使用现代 ES Modules 和浏览器原生 API。JavaScript 遵循现有风格：两个空格缩进、保留分号、默认使用 `const`，仅在需要重新赋值时使用 `let`；变量和函数使用 camelCase，常量使用 UPPER_SNAKE_CASE。DOM 引用集中放在 `els`，可变应用状态集中放在 `state`。一次性逻辑优先写成直接的小函数，不为 speculative features 增加抽象。

CSS 使用 `:root` 自定义属性、类选择器和紧凑的组件规则。新增样式前优先复用现有颜色、间距和控件模式。

## 测试规范

测试使用 Node 内置 test runner 和 `assert/strict`。测试文件命名为 `*.test.mjs`，放在 `tests/`。修复解析器或 UI 契约回归时，尽量先添加能复现问题的聚焦测试。提交前运行 `npm test`，它也会确认生成的 `index.html` 与源码一致。

## 提交与 Pull Request 规范

近期提交使用简短祈使句，例如 `Fix spreadsheet selection copy`、`Add table keyboard and range selection`。保持一次提交只解决一个明确问题，并描述用户可感知的行为变化。

PR 应包含简洁说明、已执行的测试、相关 issue 链接；涉及 UI 时附截图或录屏。若改动影响文件解析、导出行为、浏览器兼容性或本地数据隐私，应在 PR 中明确说明。

## 安全与配置提示

应用在浏览器本地处理用户文件。未经明确讨论，不要新增服务端上传路径或远程处理流程。Excel 支持可能从 `vendor/xlsx.full.min.js` 或 CDN fallback 加载 SheetJS；任何依赖或隐私影响变化都需要记录清楚。
