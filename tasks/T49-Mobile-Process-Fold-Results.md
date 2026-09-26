# 移动端任务过程折叠与结果呈现重构

> 状态：已核销
> 级别：中
> 范围：`apps/mobile`、`apps/electron`（结果判定 bug）

## 1. 目标

按 Codex 桌面端与参考图的语义重构移动端对话时间线：**执行过程降权为可折叠的过程流**，
正文结果始终可读；工具行可点开底部详情弹窗；并发工具分组折叠；执行期间显示工作时长；
结束后只呈现真正的结果消息。同批修复 PC 端「把工具前旁白误当结果」的判定 bug。

设计原则：agent 执行过程不重要——默认折叠、按需查证；结果与结论重要——始终可读。

## 2. 契约

### 2.1 轮次视图（`buildTurns(messages): readonly TurnView[]`，纯函数）

- `TurnView = { key, user, stream, result, running, failed }`；以 `user` 消息为轮次起点，
  无 user 的前置消息自成一轮。
- **过程流 `stream`** = 轮内除 `user` 与 `result` 外的全部消息（narration、thinking、
  tool、code、status）。
- **结果 `result`** 判定（PC bug 同款语义）：轮内最后一个过程消息
  （thinking/tool/status）**之后**的最后一条 assistant 消息；轮内无过程消息时取最后一条
  assistant（纯问答轮）。轮次以工具收尾、无后续 assistant 时 `result = null`——
  此时收起态只显示状态行，**不得**用工具前旁白顶替。
- `running` = 轮内存在 running 状态；`failed` = 存在 error 状态。垃圾/空输入返回 `[]`。

### 2.2 过程折叠（`ProcessFold`）

- 折叠状态：用户显式开合优先；未操作时 **failed 默认展开，其余默认折叠**（含执行中）。
- 折叠态头部一行：状态图标 + 状态文案 + 当前动作/失败原因 + 工作时长 + 展开箭头。
  执行中显示 spinner 与「已工作 X」，失败显示警示色失败原因。
- 展开态按原始顺序渲染过程流：thinking 行、工具行/并发组、status 行、叙述正文
  （Markdown）、代码工件。叙述正文在折叠态隐藏（它是过程旁白，不是结果）。
- 头部具 button 语义与 `expanded` 状态，标签含轮次状态。

### 2.3 工具行与详情弹窗

- 工具行：一行摘要（状态图标 + 标题/摘要 + 耗时 + 箭头），点击打开**底部详情弹窗**
  （复用 `components/ui/sheet.tsx`）：标题、状态、耗时、完整描述；失败原因醒目。
- 连续 ≥2 条 tool 消息折叠为**并发工具组**（「N 个工具」+ 状态 + 展开箭头），
  组内逐行可点；单独工具行直接可点。
- 运行中工具行显示 spinner；详情弹窗数据就是工具消息本身（名称、摘要、描述、耗时、状态）。

### 2.4 工作时长

- `ConversationSession` 增加可选 `startedAtMs` / `endedAtMs`（epoch ms）。
- `formatElapsed(ms)`：`29s` / `1m 16s`；非法值降级不显示。
- `useElapsedNow(active)`：仅 active 时 1Hz 刷新，卸载即清 interval（无泄漏）。
- 折叠头显示「已工作 X」（working，实时）或「共工作 X」（有终态时间）。

### 2.5 PC 端结果判定 bug（`apps/electron`）

- `visibleTurnBlocks`（`thread/turn-state.ts`）与 `turnAnchorSummary`
  （`thread/turn-anchor-data.ts`）收起/摘要选取改为「最后一个 `tools` 块之后的
  `text` 块」；无 tools 时取最后一条 text；轮以工具收尾且无后续 text 时不取旁白。
- 不改 `TurnBlock` 契约（块 id 已含 messageTs，判定在视图层完成）。

## 3. 问题域

### 处理

- 移动端轮次切分、结果判定、过程折叠、工具详情弹窗、并发工具分组、工作时长。
- Mock 会话时间戳与结果形态校准。
- PC 端两处结果/摘要选取修复与回归用例。

### 不处理

- 真实流式增量与逐 token 渲染（接入真实事件时另行处理）。
- 轮级独立计时（Mock 为单任务会话，时长为会话级；真实多轮计时随流式接入）。
- Electron 过程行交互改造（PC 既有行内展开保持不变）。
- 表格/图片/HTML 等 Markdown 扩展（T48 既定降级）。

## 4. 并发与性能预算

- `buildTurns` 单次线性遍历，`O(n)`；`useMemo` 按 messages 记忆。
- 折叠态不挂载过程流与详情弹窗内容；展开态行组件保持轻量。
- `useElapsedNow` 仅 active 时 1 个 interval，卸载清理；非 active 零定时器。
- 详情弹窗同一时刻至多一个实例（根级挂载，状态放 navigation store）。

## 5. 拆分

- `src/features/chat/turns.ts`：轮次切分与结果判定纯函数（单一真相）。
- `src/features/chat/format-elapsed.ts`、`src/features/chat/use-elapsed-now.ts`：
  时长格式化与 1Hz hook。
- `src/features/chat/process-fold.tsx`：折叠容器 + 状态头 + 过程流渲染。
- `src/features/chat/thinking-row.tsx`、`tool-row.tsx`、`tool-group.tsx`、
  `status-row.tsx`：过程行（单组件/文件）。
- `src/features/chat/tool-detail-sheet.tsx`：底部详情弹窗。
- `src/features/chat/timeline-list.tsx`：改为按轮渲染；删除 `activity-block.tsx`、
  `active-execution.ts`、`execution-todo-dock.tsx`（被折叠头取代，单轨不留旧路径）。
- `src/types/domain.ts`：会话时间字段；`src/store/navigation-store.ts`：工具详情选中态。
- `apps/electron/.../thread/turn-state.ts`、`turn-anchor-data.ts`：结果判定修复。

## 6. 实施顺序

1. `turns.ts` 测试先行（结果判定含「工具收尾不得取旁白」回归用例）→ 实现。
2. 时长纯函数与 hook 测试 → 实现。
3. 过程行/折叠/弹窗组件测试 → 实现；删除旧活动块与执行清单及其测试。
4. Mock 会话时间字段与结果形态校准；timeline 接线。
5. PC 端两处判定修复 + 回归用例。
6. 四门、覆盖率、双平台 bundle、bw 390×844 走查、对抗审查。

## 7. 裁决

- 用户裁决：过程默认折叠可开合、工具点击开底部详情弹窗、并发工具分组折叠、
  显示工作时长、结束后只显示真正的结果消息；执行过程降权。
- 用户裁决：PC 端结果判定 bug 同批修复。
- 默认裁决：运行中/收起态用一行头部承担「当前动作 + 时长 + loading」，
  移除 T47 的悬浮执行清单（与参考图冲突且与折叠头重复）；失败默认展开保留。
- 默认裁决：叙述正文随过程流折叠（按用户定义它是过程而非结果）；结果正文保持
  Markdown 渲染与开放排版。

## 8. 测试口径

- `buildTurns`：表驱动覆盖——纯问答轮、旁白+工具+结果、以工具收尾无结果、
  多轮切分、running/failed 判定、空输入；**回归用例**：「轮次以工具收尾不得把
  工具前旁白当结果」。
- 折叠：默认收起/失败默认展开、手动开合优先、running 头部含当前动作与 loading、
  failed 头部含失败原因；`expanded` 状态正确暴露。
- 工具行/组：点击打开详情、并发组折叠与展开、运行中 spinner、失败警示。
- 时长：格式化边界（0、59s、60s、非法）；hook 卸载清 interval。
- PC：`visibleTurnBlocks`/`turnAnchorSummary` 新选法表驱动 + 同症状回归用例。
- 全量回归 + bw 390×844 浅/深色走查；console/errors 为空。

## 9. 验收清单

- [x] 结果判定以「工具后旁白/结果」为准则，工具前旁白不再冒充结果（移动 + PC）。
- [x] 过程默认折叠，可手动开合；失败默认展开且原因可见。
- [x] 工具行点击打开底部详情弹窗；并发工具分组折叠。
- [x] 执行中显示当前动作、loading 与工作时长；定时器无泄漏。
- [x] 叙述正文随过程折叠，结果正文始终可读。
- [x] 旧活动块/执行清单删除，无双轨；四门、覆盖率、双平台、bw、对抗审查如实核销。
