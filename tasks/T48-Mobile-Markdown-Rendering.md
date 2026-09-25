# 移动端 Markdown 正文渲染与完整会话 Mock

> 状态：已核销
> 级别：中
> 范围：`apps/mobile`

## 1. 目标

为移动端 Agent 自然语言正文提供生产级 Markdown 渲染，并构造一份形态完整的多轮
Agent 会话 Mock，用于直观查看「完整对话消息列表」在手机上的展示效果。

Mock 参考真实会话归档 `events.jsonl` 的事件形态（user/assistant/thinking/tool/status/code、
工具调用与结果、运行中步骤），但内容全部为合成脱敏数据：不复制会话原文、路径、
凭据、工具参数或任何私人内容。

## 2. 契约

### 2.1 Markdown 解析（`parseMarkdown(source: string): readonly MarkdownBlock[]`）

- 纯函数、同步、无 IO；空串与纯空白返回 `[]`。
- 块级词表封闭：`heading | paragraph | list | quote | code | divider`，未知块降级为
  `paragraph` 纯文本。
- 行内词表封闭：`text | strong | emphasis | code | link`；strong/emphasis/link 携带
  嵌套 `content`（强调整内链接保持可点），图片、HTML、删除线等降级为纯文本
  （图片取 alt 文本），永不渲染原始 HTML。
- 列表项与引用收集其内全部块级内容（多段落、围栏代码），块间以换行分隔；
  嵌套列表在列表项中以缩进行展开，在引用中拍平为文本；内容永不静默丢失。
- 有序列表携带 `start`（Markdown 起始序号），渲染层按其编号。
- 链接保留 `href` 原文，渲染层决定是否可点；解析层不抛异常。
- 未闭合代码围栏按代码块延续到结尾，不崩溃。
- 嵌套深度上限 32，更深层级拍平进当前内容（避免病态输入平方级扫描与递归溢出）。

### 2.2 渲染（`MarkdownText`）

- 仅用于 assistant/system 正文；用户请求继续纯文本任务卡；thinking/tool/status
  继续走 ActivityBlock；独立 code 消息继续走 CodeBlock。
- 标题具 header 语义；正文可选择；行内代码用等宽字体；链接仅 `http/https` 渲染为
  可点（`Linking.openURL`，拒绝静默降级），其余协议只显示文本；URL 含控制字符
  或空主机拒绝。
- 代码围栏复用唯一 `CodeBlock` 实现（折叠 + 行数 + 语言），不双轨。
- 渲染全部基于 React Native 原语，不使用 WebView、DOM API 或 HTML 注入。

### 2.3 Mock 会话（`agentConversation`）

- 完整多轮：用户任务卡 → thinking/tool/status 活动（含失败后重试）→ Markdown 方案
  正文 → 代码工件 → 第二轮追问 → 活动（含失败与 running 步骤）。
- 覆盖 Markdown 全词表：标题、段落、粗体、斜体、行内代码、无序/有序列表、引用、
  分隔线、代码围栏、安全链接。
- 演示态末尾含 running 工具步骤，用于展示执行清单与运行活动摘要。

## 3. 问题域

### 处理

- markdown-it 词法解析到自有 AST 的映射与垃圾输入降级。
- RN 原语渲染组件族（段落/标题/列表/引用/分隔线/代码/行内富文本/安全链接）。
- 合成完整会话夹具与历史/空态入口接线。
- 解析、渲染、安全链接、夹具形态的单元与组件测试。

### 不处理

- GFM 表格、任务列表、脚注、数学公式、Mermaid、图片渲染：降级纯文本，由后续
  内容渲染能力负责。
- 流式增量解析与块冻结：接入真实流式事件时按 Electron `markdown-stream-cache`
  的冻结算法单独迁移，本次消息为整段文本。
- 语法高亮（Shiki 输出 HTML，RN 不可用）；代码块只用等宽纯文本。
- host-hub 接入、持久化、真实账号。

## 4. 并发与性能预算

- `parseMarkdown` 对每个消息文本只执行一次（`MarkdownText` 内 `useMemo` 按 source
  记忆）；无定时器、无订阅、无 IO。
- 折叠态代码块只渲染前 5 行；长代码按行截断。
- 单次解析输入上限不做硬截断，但长文本必须可换行不横向溢出；390×844 无横向滚动。

## 5. 拆分

- `src/features/chat/markdown/`
  - `markdown-types.ts`：AST 判别联合（单一真相）。
  - `parse-markdown.ts`：marked 词法 → AST 纯函数。
  - `safe-external-url.ts`：`http/https` 判定纯函数。
  - `render-inline-nodes.tsx`：行内 AST → RN `Text` 节点数组的纯渲染函数。
  - `markdown-block.tsx`：单个块渲染组件（switch 分发，不嵌套组件）。
  - `markdown-text.tsx`：公开组件，解析 + 块列表。
- `src/features/chat/code-block.tsx`：改为纯 props（code/language/title/lineCount），
  时间线 code 消息与 Markdown 围栏共用同一实现。
- `src/features/chat/assistant-message.tsx`：正文改用 `MarkdownText`。
- `src/fixtures/agent-conversation.ts`：合成完整会话；`history-store` 首位接入，
  空态「查看示例对话」直达。
- `src/strings/zh.ts`：代码块与 Markdown 相关文案集中管理（移除组件内硬编码）。
- 依赖：`apps/mobile` 显式新增 `markdown-it`（CJS、纯 JS、零 DOM、Hermes 可运行）与
  其类型包。

## 6. 实施顺序

1. 解析层测试先行：块/行内词表、边界、垃圾输入、未闭合围栏。
2. 实现 `markdown-types` + `parse-markdown` + `safe-external-url`（解析器 `markdown-it`）。
3. 渲染层测试先行：块渲染、行内样式、链接安全、代码折叠。
4. 实现渲染组件族与 `CodeBlock` props 化；接线 assistant 正文。
5. 合成完整会话夹具与入口接线；更新受影响测试。
6. 四门、覆盖率、iOS/Android bundle、bw 390×844 整段会话走查。
7. 独立对抗审查后核销。

## 7. 裁决

- 用户裁决：实现 Markdown 组件，并用真实会话事件形态合成完整 Mock 会话，用于
  查看完整对话消息列表的展示。
- 默认裁决：Markdown 只服务 assistant/system 正文；表格/图片/HTML/Math/Mermaid
  降级纯文本，不引入 WebView（否决窗口内可调整）。
- 默认裁决：解析器选 `markdown-it`（CJS、纯 JS、Hermes 可运行、Jest 可直接加载；
  token 流成熟稳定），不自研解析器、不复用 DOM 系 `streamdown`；
  `marked@17` 为 ESM-only，Jest 29 无法 require，不采用。

## 8. 测试口径

### 解析单元测试

- 六种块逐词表断言；行内五种词表断言；空输入返回 `[]`。
- 表驱动降级：图片→alt 纯文本、HTML→纯文本、表格→纯文本、未知标记→纯文本。
- 未闭合代码围栏、超长单行、空链接、强调整内链接、有序 start、病态嵌套不抛异常。
- 列表项/引用内多段落与围栏代码全部保留（块间换行分隔），不静默丢内容。
- 解析结果只含词表内 kind（词表封闭性断言）。

### 渲染组件测试

- 标题 header 语义、列表标记（有序/无序/嵌套/起始序号）、引用、分隔线、
  代码块行数与折叠。
- 行内粗体/斜体/代码/链接样式落点；正文可选择。
- 链接安全表驱动：http/https 可点并调用 openURL；javascript/file/相对路径、
  控制字符、空主机、`https://.` 永不触发打开；openURL 拒绝不崩溃。
- 垃圾 Markdown 渲染纯文本不崩溃。

### 会话 Mock 与回归

- 完整会话含 ≥3 轮用户请求、Markdown 全词表、失败重试活动、running 步骤。
- 既有时间线/活动/历史测试全量回归；bw 390×844 整段会话截图走查，
  console/errors 为空、无横向溢出。
- 假绿对抗：无新增 skip/only，断言按契约强度书写（链接只点一次、失败原因唯一、
  内容不丢失逐块断言）。

## 9. 验收清单

- [x] Markdown 六类块与五类行内节点按词表渲染，垃圾输入降级纯文本。
- [x] 列表项/引用内多块内容不丢失，有序列表保留起始序号。
- [x] 仅 http/https 链接可点（含强调整内链接），其余协议永不触发打开。
- [x] 代码围栏与时间线代码共用同一 CodeBlock，无双轨。
- [x] assistant 正文使用 MarkdownText；用户卡、活动、权限不经 Markdown。
- [x] 完整 Mock 会话可从空态直达，展示多轮正文、活动、失败重试与运行态。
- [x] 四门、覆盖率、双平台 bundle、bw 走查与对抗审查如实核销。

## 10. 验证记录与对抗审查处置

- 对抗审查报告 P1–P7、P10 全部修复：mobile 自身 eslint 门禁红（effect setState
  改渲染期派生）、列表/引用内内容丢失、引用内多段无分隔、强调整内链接丢失、
  openURL 拒绝未处理、有序列表 start 丢失、分支覆盖率下降、弱断言；
  P8 加嵌套深度上限 32 防护并测量；P9 确认为运行态设计意图（整块进执行清单）。
- 修复过程中发现 markdown-it 与 marked 词法差异（`code_inline` vs `codespan`、
  inline 子节点在 `.children`），已修正并由词表测试锁死。
- 根级 `bun run ci`：lint 0 warning / 0 error；typecheck、Electron 与 Expo Web
  production build 全部通过。
- 根级测试：2222 pass / 1 个既有 skip / 0 fail。
- 移动端 Jest：22 suites / 122+ tests 全绿；覆盖率语句 95.9%、分支 89.72%、
  函数 95.75%、行 97.66%（分支较基线 88.88% 提升）。
- `apps/mobile` 自有 eslint：0 error / 0 warning。
- Expo iOS / Android Hermes bundle：全部通过。
- bw 390×844：完整 Mock 会话的标题/列表/引用/分隔线/代码折叠/链接/失败活动/
  运行清单/深色模式走查通过；无横向溢出，console/errors 为空。
