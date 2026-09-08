# 渲染层数据流重构与 Markdown 渲染替换 方案
> 状态：已核销（2026-09-09：三批实施 + 对抗审查 + 假绿抽查 + 四门全绿；提交链 f16737e→b895244→d610db0→2248ec5→6d7e2bf）
> 级别：高（含并发/状态机/安全面，实施后过独立会话对抗审查）
>
> 需求：① 渲染层数据流全部重构（订阅模型 / tick / delta 合并 / actions 稳定化 + 管道治理）；
> ② markdown 展示全部替换为 streamdown（四插件全上），自研受限渲染删除。
> 来源：用户指示（2026-09-09）；审计基线 = 2026-09-09 渲染层与数据管道全链路深度分析（结论落档于本文「审计结论」节）。

## 审计结论（现状事实，带路径）

1. 数据管理 = Zustand vanilla 单 store（`renderer live/store.ts`），thread 级/turn 级是 store 内两层结构；**唯一订阅点 `use-live-workspace.ts:177` 整 state 订阅，零 selector**。
2. `activeThread` 派生对象 useMemo deps 为整个 state，每次 set 换引用 → 击穿 `MessageList` memo + `collectThreadDiff` O(全轮) 重算。
3. 1s `now` tick 的 `hasActivity` 覆盖全部线程：任一后台活动让全 app（含全部已结束轮）每秒重渲。
4. `appendDelta`（`fold-events.ts`）每 delta 一次 `set` + 一次全 items map + 全量字符串拼接；50ms 批内不合并。
5. `actions` 对象每渲染重建 ~50 个闭包；`workspace-main.tsx` 内联回调击穿 Sidebar/ThreadHeader memo；Esc effect 依赖 `workspace.actions` 每渲染重挂。
6. markdown 消费面**只有 assistant 正文一条路**（`turn-block-view → TextBlock → MarkdownText → parse-markdown/code-block/inline-segments`）；其余文本位（tool 输出/thinking/argsPreview/排队消息/用户消息）为纯文本，明确不 markdown 化。复制类二次使用（TextBlock/TurnTimestampRow）复制 markdown 原文，与渲染器无关。
7. 主题体系：Tailwind v4 CSS-first + 全套标准 shadcn oklch 变量 + `.dark` class 变体 + `--radius` —— streamdown 的样式消费面直接兼容；自定义 token（`--surface-subtle/--link`）需在组件映射层接上。
8. 管道治理点：`frame-decoder.ts` 每行 `buffer.slice` 二次方复制；`seenIds`/`callStarts` 无界增长；`dialogs/dialogOrder` 双结构四处手工同步；AGENTS.md 与实现漂移（无 `StreamAggregator` 实体、`packages/core`/`packages/api` 空壳）。

## 有意变更清单（行为规格基线之上的显式变更，对抗审查对照用）

| # | 变更 | 外部可见行为 |
|---|---|---|
| V1 | 整订阅 → 细粒度 selector + `activeThread` 引用稳定化 | 无（纯性能；任何 store 变更后渲染结果逐字节等价） |
| V2 | 全局 1s tick → 仅活跃 running 线程 tick；已结束轮 memo 比较器去掉 `now` | 后台线程计时冻结于最后已知值（settle 时 `endedAt` 已冻结，无信息丢失）；前台无差异 |
| V3 | 50ms 批内同块 delta 合并为一次 set | 无（渲染结果等价：同 batch 内中间态本就不可见——React 同步批处理合并渲染） |
| V4 | `actions` 引用恒定 + 内联回调消除 | 无 |
| V5 | markdown 渲染器：自研受限子集 → streamdown（cjk/code/math/mermaid 全装） | 增益：表格/任务列表/引用/删除线/Shiki 高亮/KaTeX/Mermaid/CJK 断行/未闭合块修补。**安全行为保持等价**：链接仅 http(s) 放行 + 点击经 `openExternal` 系统浏览器（禁应用内导航） |
| V6 | `frame-decoder` 行提取由 slice 复制 → 偏移游标（单 chunk 多行一次推进） | 无（解码输出与丢弃判定逐字节等价） |
| V7 | `seenIds`/`callStarts` 封顶（LRU 语义：超限丢弃最旧 id / 清理已终态 callStarts） | 水化去重依赖 `cursor` 区间 + seenIds 双保险，封顶后对账正确性不受影响（cursor 前移） |
| V8 | `dialogs/dialogOrder` 双结构 → 单一有序结构 | 无 |
| V9 | AGENTS.md 漂移修正（批推描述改为实际实现；空壳包现状标注） | 文档 |

## 逐模块裁决表

| 模块 | 裁决 | 说明 |
|---|---|---|
| `live/use-live-workspace.ts` | 重构 | selector 拆分、`activeThread` 派生稳定化、actions 稳定化、tick 本地化 |
| `live/fold-events.ts` `appendDelta` | 重构 | 批内合并（见「并发预算」）；折叠语义不变 |
| `live/client-invoke.ts` | 微修 | 批事件分组喂 store（delta 合并入口） |
| `thread/turn-group.tsx` | 微修 | 比较器去 `now`（已结束轮） |
| `thread/message-list.tsx` | 微修 | 比较器适配 tick 传递方式 |
| `renderer thread/parse-markdown.ts` | 删除 | streamdown 承接 |
| `renderer thread/inline-segments.tsx` | 删除 | 同上 |
| `renderer thread/code-block.tsx` | 删除 | `@streamdown/code` 承接 |
| `renderer thread/markdown-text.tsx` | 重写 | Streamdown 封装：保持 memo、`text` prop、复制原文入口、`isAnimating` 接 streaming |
| `thread/text-block.tsx` | 微修 | 内部消费新封装；props 不变 |
| `adapter/frame-decoder.ts` | 重构 | 行提取偏移游标化；既有解码测试为规格 |
| `live/store.ts` + `live-thread-state.ts` | 微修 | dialogs 单结构、seenIds/callStarts 封顶 |
| `AGENTS.md` | 修订 | 漂移修正 |

## 不处理清单（挂账，显式归属）

- 消息列表虚拟化——长会话渲染面，归属后续 UI 性能任务；
- `packages/core` / `packages/api` 空壳——归属调度/预算任务（T4 范畴）；
- `UiEvent.userMessage` 防御性折叠逻辑——水化对账兜底面，保留现状；
- turn settle 后 120ms 全量重建策略——对账正确性依赖，不动（批内合并已消主要热点）；
- 失焦系统通知频控、`window-state` 与 UiEvent 共线 schema 化、消息 id=timestamp 冲突面——低频/低危，挂账 T16 候选；
- 双 streaming 镜像（`sessions[].streaming`）清理——牵会话表视图语义，与本次正交。

## 并发/一致性/性能预算

- **delta 合并保序**：同一 text/thinking 块在同批内按到达序拼接为一次 append；跨块/跨类型事件不重排（batch 本身有序，合并只做相邻折叠）。`ensureLiveTurn` 迟到补开轮、`resolveMessageId` 兜底语义原样保留。
- **selector 拆分不改折叠时序**：store 单点串行 `applyEvent` 不变；拆的是订阅面，不是写面。
- **tick 预算**：全局 1s interval 仅当活跃线程 running 时存在；后台线程活动不再驱动渲染 tick。
- **streamdown**：`animated`/`isAnimating` 接 store streaming 标志；Shiki 语言按需清单（ts/tsx/js/jsx/json/bash/zsh/python/rust/go/sql/yaml/toml/html/css/markdown/diff + fallback）；mermaid 懒渲染；Katex 样式独立引入；bundle 增量以 build 产物体积记录在验收清单。
- **链接安全验收**：非 http(s) href 不渲染为可点链接；http(s) 链接点击走 `openExternal`；渲染进程内无应用内导航（Electron `setWindowOpenHandler` deny + will-navigate 拦截兜底在主进程已有则复用，无则补）。

## 测试计划

- 保留为规格：`fold-events`/`turn-ops`/`hydrate-items`/`frame-decoder`/`client-invoke` 既有测试全绿（delta 合并后 `fold-events` 用例适配批形态输入，断言语义不减弱）。
- 新增：批内合并纯函数单测（同块折叠/跨块保序/空批/单事件批/迟到 delta 补轮）；tick selector 单测（活跃 running 才产生 tick 值变化）；dialogs 单结构迁移用例；seenIds/callStarts 封顶用例；frame-decoder 多行单 chunk 用例（既有二次方路径已覆盖长行）。
- 删除：`parse-markdown.test.ts`（实现删除，规格随之消亡；streamdown 行为由库保障）。
- 新增 markdown 冒烟：demo workspace 渲染含表格/代码块/链接的正文（渲染不抛错 + 链接组件受控）。
- 每个 V 项变更至少一条对应测试；修复 bug 用例名注明症状。

## 实施顺序

1. **批1 数据流**：selector/派生稳定化 → tick 本地化 → 批内 delta 合并 → actions 稳定化 → 四门 → 提交。
2. **批2 markdown**：依赖安装 + styles 接线（@source/样式引入）→ MarkdownText 重写 + TextBlock 接线 + 链接安全 → 删自研四件套与旧测试 → 冒烟与单测 → 四门 → 提交。
3. **批3 治理**：frame-decoder 游标化 → seenIds/callStarts 封顶 → dialogs 单结构 → AGENTS.md 修正 → 四门 → 提交。
4. 对抗审查（独立会话：diff + 本文档「有意变更清单」+「并发预算」）→ 偏差处置 → 收口核销。

## 对抗审查偏差处置（独立会话，f16737e..2248ec5）

- **P1（已修复）**：Esc 键在 `!` 直执行 bash 在途时无动作——旧 effect 靠 actions 每渲染重建间接重挂掩盖了 `bashRunning` 依赖缺失；actions 稳定化后闭包陈旧。修复：Esc 语义抽纯函数 `esc-action.ts`（裁决显式化）+ `use-esc-dismiss.ts` hook（全量依赖），带症状回归用例。
- **P2（已修复）**：AgentPanel 后台子代理计时冻结（V2 门控字面后果、无补偿）→ tick 条件扩为 `executing || agentsActive`；`toggleMaximize` 未稳定化 → useCallback（兑现 V4 宣称）。
- **P2（知悉，不改）**：非 http(s) 链接降级只显示链接文字不显示 markdown 语法原文（安全语义等价，视觉更干净）；submitDraft 空线程回退值从渲染期捕获变 `''`（同落 sendFailed，仅 reason 文案不同）；noteCallStart 对已存在 key 的「最新」按首插入序近似（仅异常堆积时可达，V7 域内）。
- 其余九个怀疑方向（actions 搬家语义/selector 遗漏/tick/coalesce 边界/解码游标/dialogs 单结构/封顶除名/markdown 安全面/杂项）逐一对照等价。

## 验收清单

- [x] 四门全绿（lint 0-0 / typecheck / build / test），覆盖率行/语句/函数 ≥90、分支 ≥85 只升不降
- [ ] 流式期间后台线程事件不再驱动前台消息流重渲（可由测试或 profiler 佐证 tick 预算）
- [ ] markdown：表格/代码高亮/链接行为验证；链接仅 http(s) + openExternal；亮暗两态正常
- [ ] 自研 markdown 四件套与旧测试全删，无残留引用
- [ ] frame-decoder 既有测试全绿 + 多行单 chunk 用例
- [ ] 对抗审查偏差清单清零（修掉或引用 V 项裁决）
- [ ] 假绿抽查：无迁移矩阵外的测试删除/跳过/断言减弱
