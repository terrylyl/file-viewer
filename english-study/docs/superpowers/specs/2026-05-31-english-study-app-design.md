# 幼儿英语启蒙 PWA 产品设计

日期：2026-05-31

## 背景

目标是做一个帮助 3-6 岁幼儿园阶段儿童学习英语的 Web/PWA 应用。第一版优先服务孩子自己使用，同时为后续分享给其他小朋友、家庭使用和幼儿园课堂使用预留空间。

当前项目目录 `english-study` 为空，因此设计不受既有技术栈约束。仓库中其他目录存在未提交改动，本设计只覆盖 `english-study` 项目。

## 成功标准

第一版成功的标准是：

- 孩子打开链接后，不需要阅读说明，就能开始一次 3-5 分钟的学习。
- 孩子能通过点图、听音、选图、跟读完成一个主题关卡。
- 学习内容覆盖动物、水果、食物 3 个主题，每个主题 50 个词。
- 每个主题能自由探索，也能按关卡学习。
- 进度和贴纸奖励能在本机保留。
- 应用可以通过浏览器链接分享，并具备基础 PWA 能力。

## 用户与场景

### 主要用户

3-6 岁儿童，优先支持孩子独立操作。

### 辅助用户

家长和幼儿园老师。他们不是第一版主流程用户，但需要能够帮助孩子打开应用、选择主题，并在需要时使用自由图鉴进行点读或投屏。

### 使用场景

- 孩子在手机或平板上独立学习。
- 家长把链接分享给其他孩子。
- 老师在幼儿园课堂上投屏主题图鉴，带孩子一起听音和认词。

## 产品方向

第一版采用“闯关学习 + 自由图鉴”的组合。

推荐理由：

- 闯关学习能提供明确节奏，避免孩子迷路。
- 自由图鉴适合孩子反复点读，也适合课堂投屏。
- 后续可自然扩展到课堂模式、班级任务和多人小游戏。
- 比故事冒险更容易控制第一版内容制作量。
- 比课堂小游戏平台更适合孩子独立使用。

## 学习目标

第一版聚焦：

- 听懂基础词汇。
- 通过图片认词。
- 进行轻量跟读。

第一版不做强 AI 发音评分。3-6 岁孩子发音差异大，早期以鼓励和模仿为主，避免用分数制造挫败感。

## 内容结构

第一版包含 3 个主题，每个主题 50 个词，总计 150 个词。每个主题拆成 5 个关卡，每关 10 个词。

### Animals

- Level 1: cat, dog, bird, fish, rabbit, duck, cow, pig, horse, sheep
- Level 2: lion, tiger, elephant, monkey, bear, panda, giraffe, zebra, kangaroo, koala
- Level 3: mouse, frog, turtle, snake, fox, wolf, deer, goat, hen, rooster
- Level 4: bee, butterfly, ant, spider, whale, dolphin, shark, penguin, seal, octopus
- Level 5: owl, eagle, parrot, peacock, camel, donkey, squirrel, hedgehog, hippo, rhino

### Fruits

- Level 1: apple, banana, orange, grape, strawberry, watermelon, pear, peach, mango, pineapple
- Level 2: lemon, cherry, blueberry, raspberry, blackberry, kiwi, melon, coconut, papaya, plum
- Level 3: apricot, fig, guava, lychee, pomegranate, dragon fruit, passion fruit, star fruit, grapefruit, lime
- Level 4: tangerine, mandarin, nectarine, cantaloupe, honeydew, cranberry, date, persimmon, quince, jackfruit
- Level 5: durian, rambutan, longan, gooseberry, currant, mulberry, boysenberry, breadfruit, soursop, plantain

### Food

- Level 1: milk, bread, egg, rice, cake, cookie, cheese, noodles, chicken, soup
- Level 2: pizza, pasta, sandwich, hamburger, hot dog, fries, pancake, waffle, cereal, yogurt
- Level 3: salad, carrot, potato, tomato, corn, peas, beans, broccoli, cucumber, pumpkin
- Level 4: fish, beef, pork, sausage, bacon, meatball, dumpling, sushi, taco, burrito
- Level 5: ice cream, chocolate, candy, popcorn, cracker, muffin, donut, pie, jam, honey

### 词条数据

每个词条包含：

- 英文单词
- 中文辅助提示
- 简单例句
- 所属主题
- 所属关卡
- 图片资源引用
- 可选音效引用

示例：

```json
{
  "word": "cat",
  "zh": "猫",
  "sentence": "It is a cat.",
  "theme": "animals",
  "level": 1,
  "image": "assets/animals/cat.png",
  "sound": "assets/sounds/cat.mp3"
}
```

中文提示只作为家长或老师辅助，不作为孩子主界面的重点。孩子主界面以图像、声音和触摸反馈为主。

## 核心流程

### Home 首页

首页提供 3 个超大主题入口：

- Animals
- Fruits
- Food

每个入口使用大插画或明确图标。页面文字少，按钮足够大，适合触屏点击。家长入口可以放在角落，但第一版不需要做复杂家长后台。

### Theme 主题页

主题页包含：

- 主题名称
- 学习进度，例如 1/3
- Start 按钮
- Explore 按钮
- 5 个关卡入口

关卡可以顺序解锁。未完成前置关卡时，后续关卡可以显示但不强调，避免孩子被复杂状态干扰。

### Lesson 闯关页

每关包含 4 个学习词，固定流程为：

1. Learn：展示 4 张大图。孩子点图播放英文单词和可选例句。
2. Listen：播放一个单词，孩子从 3-4 张图中选出正确图片。
3. Speak：孩子按住麦克风，模仿单词或短句。
4. Reward：完成后获得一张主题贴纸。

错误反馈采用鼓励方式，例如重新播放音频、轻微提示正确图片，不显示红叉或失败分数。

### Explore 自由图鉴

自由图鉴展示当前主题 50 个词的图片网格。孩子点任意图片后：

- 播放英文单词。
- 显示英文单词。
- 可播放简单动画或音效。

该模式不评分、不失败，适合反复点读和课堂投屏。

## 奖励与进度

奖励机制保持轻量：

- 每完成一关获得 1 张贴纸。
- 每个主题共 3 张贴纸。
- 不做排行榜。
- 不做复杂积分体系。

本地保存：

- 已完成关卡
- 已获得贴纸
- 最近学习主题

第一版不要求账号登录。未来如果进入幼儿园场景，再增加班级码、老师端和云端同步。

## 技术设计

### 应用形态

第一版做成 Web/PWA：

- 支持手机、平板和电脑浏览器。
- 优先适配触屏。
- 可以通过链接分享。
- 后续可以安装到桌面或包装成原生 App。

### 前端

建议采用轻量单页应用结构。第一版重点是可靠的互动闭环，不引入不必要的后端。

核心模块：

- 内容数据模块：本地 JSON 或 TypeScript 数据。
- 主题与关卡路由：Home、Theme、Lesson、Explore。
- 音频播放模块：播放单词和例句。
- 跟读交互模块：处理按住录音的 UI 状态。
- 进度存储模块：使用 `localStorage`。
- PWA 模块：manifest、图标、基础缓存。

### 声音

第一版可以先使用浏览器语音合成播放英文单词和例句。如果效果不够自然，再替换为真人录音或第三方 TTS 音频文件。

跟读第一版只做交互体验：

- 按住麦克风开始。
- 松开结束。
- 给出鼓励反馈。

不做发音评分。

### 图片

MVP 可以使用统一风格插画、emoji 或开源图片作为临时素材。正式版本需要统一儿童插画资产，确保每个词图片清晰、无歧义。

后续前端实现阶段使用 `frontend-design` skill，重点关注：

- 幼儿触屏体验。
- 大按钮和稳定布局。
- 少文字、强图像。
- 明确但不过度刺激的奖励反馈。
- 手机、平板、桌面响应式体验。
- 适合幼儿园投屏的视觉清晰度。

## MVP 范围

第一版包含：

- Home 首页
- Animals / Fruits / Food 三个主题页
- 每个主题 5 个关卡
- Learn / Listen / Speak / Reward 四步流程
- Explore 自由图鉴
- 本地进度和贴纸奖励
- 基础 PWA 配置

第一版不包含：

- 账号系统
- 付费系统
- 老师后台
- AI 发音评分
- 多人课堂抢答
- 复杂课程管理
- 云端同步

## 后续扩展

后续可按实际使用反馈扩展：

- 幼儿园课堂模式：大屏点读、全班互动、老师控制播放。
- 分享模式：生成主题学习链接或关卡链接。
- 班级码：老师创建班级，孩子进入指定主题。
- 更自然的声音资源：真人录音或高质量 TTS。
- 更多主题：颜色、形状、身体、交通、家庭成员。
- 轻量学习报告：本机查看孩子完成了哪些主题。

## 验证计划

第一版完成后需要验证：

- 首页在手机和平板上是否无需说明即可开始。
- 每个主题是否能完成 5 个关卡。
- Listen 步骤是否能正确判断选择。
- Speak 步骤是否能正常完成按住和松开的交互。
- Reward 是否正确发放贴纸。
- Explore 是否能播放 50 个词。
- 刷新页面后进度是否保留。
- PWA manifest 是否可被浏览器识别。
- 文本和按钮在移动端不重叠、不溢出。

## 风险与取舍

最大风险是第一版内容量偏大。3 个主题、150 个词比典型 MVP 更重，因此实现时要控制每个词的资源复杂度，优先完成可玩的学习闭环，再打磨插画和声音质量。

第二个风险是语音合成质量不稳定。为降低风险，音频模块需要能平滑切换到静态音频文件。

第三个风险是孩子独立使用时误触较多。界面应减少小按钮和多层菜单，关键交互使用大面积点击区域。

## 已确认决策

- 第一版目标用户：孩子自己用。
- 后续使用场景：可分享给其他小朋友，也可扩展到幼儿园。
- 第一版平台：Web/PWA。
- 第一版学习目标：听懂和认词为主，少量跟读。
- 第一版主题：动物、水果、食物。
- 每个主题词量：50 个。
- 核心产品方案：闯关学习 + 自由图鉴。
- 前端实现阶段使用 `frontend-design` skill。
