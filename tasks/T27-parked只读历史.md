# T27 · parked 只读历史（读不唤醒，写才唤醒） 方案

> 状态：定稿（2026-09-10）
> 级别：大（借件：hub 协议语义扩展〔外部仓库先行〕+ 本仓库渲染层懒恢复语义改造；方案结构与存量审计纪律借迁移方法论）
> 动机：真机反馈——worker 空闲 15 分钟退役后，点开对话**浏览**历史也会重新拉起 worker（selectSession → parked → session/resume → hub ensureAwake），浏览性唤醒白付一轮 worker 生命周期内存；期望「点开只读渲染历史，发消息才唤醒」。hub 侧方案：`/Users/wrr/work/pi/app/docs/plans/2026-09-10-parked-read-history.md`（唯一真相，本文档只记本仓库侧改造与联动契约）。
> 前置：T16 建立的 parked 占位 + 按需 resume 语义；本任务把「按需」从会话粒度收窄到读写粒度。

## 契约

- **hub 协议（语义扩展，词表零新增）**：`get_entries`/`get_state` 对 parked/dead thread 由 host 本地直读会话文件应答（不 spawn worker）；live thread 照旧透传；直读失败回退唤醒路径。其余 thread 级命令对非 live thread 的唤醒语义不变。详见 hub 方案 §二（含字段同源表）。
- **本仓库 contracts**：`PaiCommandType` 词表不变；`get_entries`/`get_state` 相关注释同步直读语义（协议字面量仍只允许出现在 adapter/contracts/夹具三处）。
- **渲染层行为变更**：
  - 点开 parked 会话 = **只读激活**：直接 `setActiveThread`（不 `wakeAndActivate`、不发 `session/resume`），历史经 `session/entries`（hub 直读）水化。
  - 浏览态输入框**可输入**：发送时走既有 `ensureLiveSession` 兜底（resume 唤醒 → 以响应 threadId 投递）——链路已存在（submitDraft），本任务不动。
  - bootstrap 自动选中的 parked 会话、host 重启对账回落 parked 的活跃会话：**只读激活，不自动唤醒**（拆除 T16 的两处自动唤回）。
- **parked 态查询降级**（hub 直读面之外的 worker 级查询不发）：
  - `session/thinkingLevels`：跳过，思考档控件用 `effortOptionsFor` 本地推导（新任务页既有路径；模型取注册表视图 model 字段）；
  - `command/list`：跳过（斜杠补全在会话 live 化后可用；浏览态空补全）；
  - `session/stats`：跳过（用量显示最后已知值）;
  - `get_permission_rules`：照旧（host 本地，不涉及唤醒）。
- **错误形态**：直读失败在 hub 侧已 fail-open 回退唤醒；若唤醒后 resume 仍失败，走 T16 既有错误面（通知条 + 占位保留）。

## 问题域

- 处理：selectSession 的 parked 分支改只读激活；use-live-workspace 会话激活 effect 的 parked 分支反转（拉 entries 水化、跳过 worker 级查询）；live-controller 两处自动唤醒拆除（bootstrap 选中、回落唤回）；store/组件对「parked 会话作为 activeThread」的兼容审计；thinkingLevels/stats/commands 的浏览态数据源切换。
- 不处理：
  - hub 侧任何实现（外部仓库，走其流程）；
  - `get_messages`/`get_session_stats`/`get_commands`/`get_thinking_levels` 的直读化（hub 方案 §三 不处理清单）；
  - 浏览态 setModel/setThinking/setName 的行为改造——set_name 对 parked 已有主进程本地化路径（api-routes 既有分支）；set_model/set_thinking_level 对 parked 会照常唤醒（改设置是交互意图，唤醒合理，保持现状）；
  - fork/clone 链路（写命令，照旧唤醒）；
  - 直读历史的虚拟化/分页 UI 改造（`before` 翻页既有通路照用）。

## 并发/一致性预算

- 点开 parked 会话：0 次 `session/resume`、0 worker spawn；`get_entries` ≤2 次（首屏 + 游标失效重拉）。
- 发消息：≤1 次 resume（waking 去重既有）+ 1 次 prompt——与 T16 预算一致，无新增。
- 浏览态切换 N 个会话：0 worker 常驻（对比现状：N 个 worker 各占 ≈110MB 至下次退役）。
- 渲染层事件面：parked 会话激活期间无该线程事件流（无 worker），store 折叠态静止——无新增定时器。

## 拆分

- **渲染层** `live/live-controller.ts`：`selectSession` parked 分支改 `activate`；`start()` bootstrap 自动选中不再唤醒；`sessionUpdated(parked,活跃)` 回落不再唤回（注释同步）；`hydrateFull` 对 parked 直接可用（hub 直读后 get_entries 对 parked 成功）。
- **渲染层** `live/use-live-workspace.ts`：会话激活 effect 的 parked 分支反转——parked 也拉 `ensureHydrated`；thinkingLevels/commands/stats 改为 `activeSessionState === 'live'` 才发；思考档控件数据源接 `effortOptionsFor`（parked 态）。
- **渲染层** `live/lazy-resume.ts`：`wakeAndActivate` 保留（submitDraft 兜底链使用），公共入口收敛——`selectSession` 不再调用。
- **contracts** `packages/contracts/src/commands.ts`：`get_entries`/`get_state` 注释同步（直读语义）。
- **主进程**：零改动（`session/entries`/`session/state` 路由原样，parked 直读在 hub 侧透明）。
- **strings**：如有浏览态提示文案需求走 zh/en 目录（预计无新增文案）。

## 实施顺序

| # | 内容 | 验收点 |
| --- | --- | --- |
| M0 | hub 仓库：方案已定稿 → backend 端口 + 直读模块 + host 短路 + 单测/smoke + design.md v0.12/api.md + `npm run ci`（含双 e2e） | hub ci 全绿；独立提交（外部仓库） |
| M1 | 本仓库：contracts 注释同步 + 渲染层 selectSession/bootstrap/回落 只读激活 + effect parked 分支反转 + 控件数据源切换 + 渲染层单测 | 回归用例绿（症状名「点开对话即拉起 worker」）；四门全绿 |
| M2 | 对抗审查（独立会话：diff + 契约/不处理清单/并发预算节选）+ 问题清零 + 修复回归 | 审查清单清零（驳回附理由） |
| M3 | 收口：验收清单核销 + 覆盖率数字如实报告 | 全清单勾 |

过渡态：hub M0 落地前本仓库渲染层若先行，parked 直读会失败（get_entries 对 parked 唤醒）→ **顺序硬约束：M0 先于 M1**；M1 落地后单轨（无新旧双路径——selectSession 只有只读激活一条路，唤醒只在 submitDraft 兜底）。

## 裁决

- 协议形态：**语义扩展**（不新增命令）——客户端零选路分叉（用户默认裁决 1，否决窗口保留）。
- 浏览态 UX：**输入框可输入**，发送才唤醒（用户默认裁决 3）。
- 只读范围：**get_entries + get_state**（用户默认裁决 4）；stats/thinkingLevels/commands 浏览态本地回退/跳过。
- hub 实施：**本会话直接在 hub 仓库走其完整流程**（文档 → 实现 → ci → 提交），随后回本仓库同步（用户默认裁决 2）。

## 测试口径

**回归（症状名）**：
- 「点开对话即拉起 worker」：selectSession 对 parked 不发 `session/resume`（fake client 断言调用序列）。
- 「bootstrap 自动选中即唤醒」/「host 重启回落自动唤回」：同上，两触发点断言零 resume。
- 「浏览态拉注定失败的 worker 级查询」：parked 激活期间不发 thinkingLevels/commands/stats。

**契约级**：
- parked 激活后 `ensureHydrated` 走 `session/entries` 且数据渲染（fake 应答直读形状）。
- submitDraft 对 parked 仍 `ensureLiveSession` → resume → 换 id 激活 → prompt（既有链路不回归）。
- live 会话的 selectSession/查询行为不回归（负向）。
- 思考档控件 parked 态用本地推导值、live 态用 hub 值（翻转时切换）。

**边界**：
- parked 会话无 sessionPath（理论上不存在——对账已清理）：selectSession 仍只读激活，hydrate 失败占位（不唤醒）。
- resume 失败面：通知条 + 占位保留（T16 既有用例不回归）。
- bootstrap 选中 parked → 只读激活 → 用户发消息 → 唤醒 → live 翻转后 effect 重跑拉全量查询（状态翻转依赖既有）。

## 验收清单

- [ ] hub 仓库 M0 全绿（ci + 双 e2e + 文档同提交）
- [ ] 本仓库契约节逐条：点开零唤醒 / 发消息唤醒 / bootstrap 与回落不自动唤醒 / 浏览态查询降级
- [ ] 回归用例（症状名）三条入 `__test__`
- [ ] 四门全绿 + 覆盖率（行/语句/函数 ≥90、分支 ≥85）只升不降
- [ ] 对抗审查问题清零（独立会话）
- [ ] contracts 镜像与 hub 文档同变（无漂移）
