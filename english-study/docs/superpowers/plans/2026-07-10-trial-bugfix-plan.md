# English Study 试用问题修复实施计划

1. 为课程领域模型补充失败测试：随机抽 4 词、推进守卫、听辨选项和录音完成状态。
2. 重构 `lesson.ts`，把课程规则收敛到纯函数。
3. 为内容模型增加插画路径并替换误导 emoji 数据。
4. 重构 `LessonScreen` 的 Pointer Events 录音流程和不可用降级。
5. 更新 `WordCard`、Home、Theme、Explore 与样式，接入统一插画和移动端布局。
6. 更新组件与 E2E 测试，使断言验证产品意图而不是最短点击路径。
7. 运行 `npm test`、`npm run build` 与 Chrome channel E2E；修复全部失败。
8. 生成桌面和移动端截图，核对布局、卡片数量、状态反馈和控制台错误。

