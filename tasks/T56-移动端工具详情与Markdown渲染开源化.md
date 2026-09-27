# 移动端工具详情与 Markdown 渲染开源化

> 状态：定稿（用户裁决：四块全做、iOS/Android/Web 三端兼容；否决窗口内可调整）
> 级别：中（外部数据契约不变；新增外部依赖；替换存量渲染模块；含链接安全面）
> 范围：**仅 `apps/mobile`**（用户裁决：不动 `apps/electron` 与 `packages/*`，共享包只消费不修改）

## 1. 目标

为移动端四个渲染面引入开源能力，消除三处功能缺口与一处乱码缺陷：

| 面 | 现状（自绘） | 目标 |
|---|---|---|
| markdown 正文 | markdown-it→自建 AST→自绘（T48） | 换 `react-native-marked`：表格/图片/删除线/任务列表全量 Markdown，长文 FlatList 渲染 |
| 文件/代码内容 | 等宽纯文本 `CodeBlock` | shiki 词法高亮（token→自绘 RN Text），与 PC 同引擎不同实现 |
| diff 展示 | `DiffLines` 红绿行（无词级） | jsdiff 行内词级高亮 |
| shell 命令/输出 | 等宽纯文本，**ANSI 转义符渲染成乱码** | SGR→主题 token 映射（自绘解析器），乱码根治、16 色映主题灰阶/红绿 |

## 2. 存量审计（替换前审计，不盲删）

被替换段：`apps/mobile/src/features/chat/markdown/*`（T48 交付，已核销）。

- **正确性**：T48 验收清单全过；现行 jest 29 suites / 178 tests 全绿；词表封闭、
  垃圾降级、链接安全均有测试锁定。
- **契约符合**：对外只有 `MarkdownText`（source→RN 视图）与 `CodeBlock`（code/language/
  title/lineCount）两个组件 API——**新实现保持这两个 API 形态不变**（换引擎不换接口）。
- **依赖方向**：markdown 模块只依赖 react-native/theme/strings；新实现同样只依赖
  react-native 原语（react-native-marked 用 RN 视图渲染，无 WebView/DOM）。

**必须存续的不变量（继承 T48 裁决，逐条回归）**：

1. 链接仅 `http/https` 可点并 `Linking.openURL`；`javascript:`/`file:`/相对路径/含控制
   字符/空主机**永不触发打开**；openURL 拒绝不崩溃。
2. **永不渲染原始 HTML**，不引入 WebView/DOM API/HTML 注入。
3. 垃圾输入（病态嵌套、超长行、未闭合围栏、畸形表格）降级不崩。
4. 代码围栏与时间线代码共用唯一 `CodeBlock`，不双轨。
5. 仅 assistant/system 正文走 markdown；用户卡、活动行、权限卡保持现状。

## 3. 契约（按批次）

### M1 markdown（换 `react-native-marked@8`）

- `MarkdownText` 组件 API 不变（`{ source: string }` 族）；内部引擎替换。
- GFM 全量：表格、删除线、任务列表、图片（外链 http/https 且经安全判定；其余降级
  alt 文本）、围栏代码、列表/引用/标题/分隔线。
- 链接安全语义与 §2 不变量 1 完全一致（renderer 覆盖实现，spike 验证钩子存在性）。
- HTML 块/行内 HTML 一律降级纯文本（不变量 2）。
- 渲染全部 RN 原语；浅/深色跟随 `useAppTheme` 主题 token。

### M2 shell ANSI 消解

- `parseAnsiSegments(text): readonly { text: string; style: AnsiStyle | null }[]` 纯函数：
  SGR（16 色/粗体/斜体/下划线/反显）→ 主题 token 映射；其余转义序列（光标移动、
  OSC、控制字符）**整段丢弃**；非法/截断序列降级为可见纯文本，不抛异常。
- `ToolDetailSheet` 的命令与输出改经 `AnsiText` 渲染；无转义符文本渲染结果与现状逐字节一致。

### M3 diff 词级高亮

- `DiffLines` 输入不变（`readonly EditHunkView[]`）；相邻 remove/add 行对内用 jsdiff
  算词级差异，差异词在行内加重（颜色沿用 diffAdd/diffDel 系 token，加重用字重/底色）。
- 无配对行（单侧增删）保持现状整行着色；jsdiff 对超长行（>2000 字符）跳过词级、退整行。

### M4 代码高亮（shiki token → RN）

- `CodeBlock` props 不变；新增内部高亮：shiki `codeToTokens`（`@shikijs/engine-js`，纯 JS
  可跑 Hermes/RNW）→ 逐 token 自绘 `Text`；主题取 shiki `github-light`/`github-dark`
  随 `useAppTheme` 切换。
- 语言不识别/超长代码（>20KB）/高亮异常 → 整块退等宽纯文本（现状行为）。
- 语法高亮对 markdown 围栏代码同样生效（经唯一 CodeBlock，不变量 4）。

## 4. 问题域

处理：上述四个渲染面的引擎/解析层开源化与接线；三端（iOS/Android/Web）渲染与
构建兼容；相应测试改写与补强。

不处理（归属写清）：

- **PC 端（apps/electron）与共享包（packages/*）**：一律不动（用户裁决：只做移动端）。
- 流式增量解析与块冻结（T48 已声明，属流式接入任务）；本轮仍整段文本。
- 数学公式、Mermaid：仍降级纯文本（如需，另立任务）。
- 图片下载缓存/查看器：只做布局内渲染，缓存策略不属本轮。
- 输入区、历史列表、设置页等非工具详情/正文渲染面。

## 5. 裁决

- **用户裁决**：四块全做；iOS/Android/Web 三端兼容；只做移动端（`apps/mobile`）。
- **用户裁决**（T48 继承）：Markdown 服务 assistant/system 正文；代码围栏复用唯一 CodeBlock。
- 默认裁决（否决窗口）：
  - markdown 引擎选 `react-native-marked@8`（唯一活跃现代 RN 实现，marked 18 + FlatList）。
    **决策树**：若 M0 spike 证伪（marked ESM 在 Jest 29 无法加载 / RNW 不渲染 / 病理
    输入崩溃且不可挡），回退为保留自研管线（markdown-it）+ 自补表格/删除线/任务列表/
    图片四个块级能力，其余批次不受影响。
  - 高亮引擎选 shiki（`@shikijs/engine-js`）；若 Hermes/RNW 性能或包体不达标回退
    `prismjs` core（同样只用词法、自绘渲染）。依赖只进 `apps/mobile/package.json`。
  - ANSI 选自绘 SGR 解析器（生态无健康 RN 库：ansi-to-react-native/react-native-ansi
    均不存在）；`strip-ansi` 仅作对照，不上色方案不采用。
  - diff 词级用 `diff@9`（jsdiff，零依赖、活跃）；不做整文件 diff 视图（输入是服务端
    EditHunkView，非 git diff 文本）。

## 6. 拆分（全部在 apps/mobile 内）

- `src/features/chat/markdown/`：`markdown-text.tsx` 保留公开组件；内部换
  react-native-marked + `renderer` 覆盖（链接安全、HTML 降级、主题映射）；
  `parse-markdown.ts`/`markdown-types.ts`/`render-inline-nodes.tsx`/`markdown-block.tsx`
  删除（零兼容层，收口单轨）。
- `src/features/chat/ansi/`：`parse-ansi.ts`（纯函数）+ `ansi-text.tsx`（渲染）。
- `src/features/chat/code-highlight/`：`tokenize.ts`（shiki 封装 + 缓存 + 降级）+
  `highlighted-code.tsx`（token→Text 渲染）。
- `src/features/chat/diff-lines.tsx`：接 jsdiff 词级（行内 span 渲染）。
- `src/features/chat/code-block.tsx` / `tool-detail-sheet.tsx`：接线，不改对外 API。
- 依赖新增（仅 apps/mobile）：`react-native-marked`、`diff`、`shiki`、`@shikijs/engine-js`。

## 7. 实施顺序（每步四门全绿；每步独立可回滚）

0. **M0 spike**（不进产品代码）：marked ESM×Jest 加载、RNW 渲染、CJK、病理输入、
   renderer 链接钩子、shiki engine-js 在 web/jest 跑通与包体量测 → 定案或走决策树回退。
1. **M1 markdown**：测试口径先行（渲染级断言替代 AST 断言）→ renderer 覆盖（安全链接/
   HTML 降级）→ 主题映射 → 切换 MarkdownText → 删旧管线与旧测试 → 不变量 1-5 逐条回归。
2. **M2 ANSI**：parse-ansi 表驱动测试（16 色/样式/垃圾序列）→ AnsiText → ToolDetailSheet 接线。
3. **M3 diff 词级**：jsdiff 封装测试 → DiffLines 行内高亮 → 复杂配对用例。
4. **M4 代码高亮**：tokenize 降级矩阵测试 → HighlightedCode → CodeBlock/围栏接线 → 包体与滚动性能实测。
5. **对抗审查**（含链接安全面）：独立会话审 diff + 本方案节选（§2 不变量/§3 契约/§4 不处理），
   问题逐条处置后收口。

## 8. 测试口径

- **不变量回归（§2 五条逐条）**：链接安全表驱动（协议矩阵：http/https/javascript/file/
  相对/控制字符/空主机，断言 openURL 调用次数）；HTML 降级；垃圾输入不崩；CodeBlock
  单轨；正文路由边界。
- **词表/降级矩阵**（表驱动）：markdown GFM 全量块渲染级断言 + 未知/畸形降级；
  ANSI 的 SGR 码表 × 16 色 × 样式组合；shiki 语言识别/超长/异常三路降级。
- **边界**：空串/纯空白/超长行/未闭合围栏/病态嵌套（markdown）、截断转义序列（ANSI）、
  >20KB 代码（高亮）、无配对 diff 行、超长行词级跳过。
- **回归**：开发中每个 bug 一个回归用例，用例名注明症状。
- **三端**：jest（RNTL）覆盖组件行为；`bun run build`（含 expo web production build）
  过构建门；bw `expo start --web` 实测渲染与 console/errors；iOS/Android Hermes
  bundle 构建通过（`expo export --platform ios/android`）。
- 假绿对抗：不删断言换绿；替换旧测试时新断言强度 ≥ 旧断言（逐条对照记录）。

## 9. 验收清单

- [x] 不变量 1-5 逐条回归通过（含链接协议矩阵、图片/链接图片双 URL 判定、HTML 剥标签、
  空 alt 不渲染、垃圾/病理输入降级、openURL 拒绝吞错）
- [x] markdown GFM 全量能力渲染（表格/删除线/任务列表/CJK，渲染级断言 26 条）
- [x] shell 输出无 ANSI 乱码，16 色映主题 token，垃圾序列降级（解析 21 条表驱动用例）
- [x] diff 行内词级高亮（无配对行退整行、超长行跳过，jsdiff 配对矩阵 5 条）
- [x] 代码高亮生效；不识别语言/超长/异常退纯文本（shiki 真引擎 + 降级矩阵；web 实测
  33/50 个着色 span，iOS Hermes bundle 过）
- [x] 零兼容层：旧 markdown AST 管线（parse-markdown/markdown-types/render-inline-nodes/
  markdown-block）与旧测试删净，无双轨字段
- [x] 四门全绿 + 覆盖率 96.79/89.72/97.24/98.56（stmts/branch/funcs/lines，均超阈值）
  + 测试 204 条 / 33 套件 + expo web/iOS/Android bundle
- [x] 对抗审查问题清零（P1×4 全修；P2×6 修 2 记账：P2-6 Hermes 运行时待真机确认、
  P2-7 CI Node 版本待流水线证实；P3×10 快修 2（图片 image 角色、测试 tone 类型谎言）
  其余记账）；处置明细见 §10。

## 10. 对抗审查处置（独立会话，2026-09-28）

- **P1-1 深层嵌套炸栈**→ 修：`nesting-guard.ts`（行级嵌套深度估算，>300 退纯文本）+
  MarkdownText 解析 try/catch 兜底；回归用例（9000 层引用链降级不崩）。
- **P1-2 深色强调 #333 隐形**→ 修：strong/em/strikethrough/codespan 显式钉 `colors.text`
  （codespan 底 surfaceSubtle）；浅/深双主题断言。
- **P1-3 空主机放行**→ 修：`safe-external-url` 重写为主机形态正则（域名/IPv4/IPv6/端口
  齐全才过）；URL 表 +8 个绕过形态回归。
- **P1-4 代码空行被吞**→ 修：HighlightedCode 逐行显式换行（空行也保真）；回归用例。
- **P2-1 任务列表未交付**→ 修：`normalize-task-lists` 把 checkbox 归一为 ☑/☐ 字形
  （库的 Parser 丢弃 checkbox token）；勾选态可见回归用例。
- **P2-2 闪旧 token**→ 修：state 与 key 绑定，换码/换主题不残留；同步断言。
- **P2-3 memo 恒失效**→ 修：`allHunkLines` 收进 useMemo。
- **P2-4 截断 OSC 吞后文**→ 修：与截断 CSI 同口径（剥 ESC] 余文可见）；回归用例。
- **P2-5 缓存只防条数不防字节**→ 修：条数 + 字符双预算淘汰（500KB）。
- **P2-8 样式风暴 N 节点**→ 修：AnsiText 段数上限 300，超限降级单节点（内容不丢）。
- **P2-6 Hermes 运行时假设**→ 记账：jest 在 Node 跑真 shiki、bundle 构建不执行正则；
  Hermes 真机验证是发版前走查项（不达标走决策树回退 prism）。
- **P2-7 CI Node 版本**→ 记账：垫片依赖 `process.getBuiltinModule`（Node ≥22.3 / Bun）；
  CI 实跑待证实（属流水线配置，不在移动端范围）。
- **P3**：修 markdown-image `accessibilityRole="image"`、diff-word 测试 tone 类型谎言；
  其余（scaleListItem 向 View 塞 TextStyle、svg 图片回退 RN Image、HTML 剥标签不解码实体、
  getSize 占位 200 高、38:5 冒号语法、全局 getSize 假尺寸、链接无下划线强调、
  code-highlight 目录分支水位、slugger 计数器）逐条记账备忘。

## 11. 实施记录（与方案的偏差及根因）

- **MDImage 无限取尺寸循环（库缺陷）**：react-native-marked 的 MDImage 在无依赖 effect 里
  取尺寸，setState 又触发渲染→再取，真机上是持续网络/电量泄漏（jest 下同步桩直接死循环）。
  在我们这层根治：自绘 `markdown-image.tsx`（`[uri]` 依赖 + alive 守卫 + 失败/零尺寸兜底）。
- **jest ESM 增量发现**：marked/github-slugger/diff/shiki 系全部 type:module 被 Jest 29 CJS
  require 拒载；垫片必须经 `process.getBuiltinModule` 取原生 createRequire（jest 的
  createRequire 被接管成带 moduleNameMapper 的 require，会循环自引用拿到空 exports）；
  另 **`import()` 动态导入垫片在 jest 环境返回空命名空间**（展开式导出也无效），故 shiki
  语法由惰性动态导入改为静态导入（5 语法进包，代价可接受；方案 §6 的「按需分片」作废）。
- **上游类型与实现不一致**：react-native-marked 的 `listItem(styles?: ViewStyle)`、
  `tableCell?: ViewStyle` 与其实际用法（Text/View 混落）不符；tableCell 文字样式由解析层
  text 样式承担（MDTable 将 cellStyle 落在 View 包装上），listItem 覆写按基类签名对接。
- **T54 列表项 13px 裁决保全**：库的列表项正文叶拿正文样式，`listItem` 覆写递归给子树
  追加 row 字级（后写覆盖）；视觉层级用例（列表项降级）无改动通过。
- **shiki 引擎实测**：JS 引擎冷启动一次性 300-800ms/语言后 200 行 8-9ms（结果缓存上限 100
  防泄漏）；web 实测两个代码块 33/50 个着色 span、console/errors 为空。
- 语言支持面首发 5 种（typescript/javascript/python/bash/json + 常用别名），未登记语言
  退等宽纯文本（契约允许）；扩语言 = 注册表加一行。
