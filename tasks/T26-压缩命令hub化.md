# 压缩命令 hub 化（/compact 目录下发 + prompt 通路拦截）方案

> 状态：已实施（2026-09-10；B1 hub 批次由用户在 pi 仓库 `t26-compact-hub` 分支完成——词法真相 `src/compact-invocation.ts`、能力注入 `WorkerContext.capabilities`、拦截响应 command 字段仍 `prompt`、design.md v0.11 增补、测试与 e2e 旅程齐备；B2 Pai 批次由本仓库完成，桥下线）
> 级别：中（跨仓库协议语义变更；无存量数据迁移、协议演进向后安全、两仓库改动面各自可控——不足大级三件套，按 design-b 走方案+实施两节；B1 hub 批次即天然最小垂直切片）
> 用户裁决（2026-09-10）：推翻 T25 默认裁决①（渲染层拦截），改为 hub 侧机制——与 skill 触发同型：`get_commands` 目录下发条目 + prompt 通路处理。T25 的本地注册表（builtin-commands.ts）是为「hub 尚未提供」准备的桥，其 `mergeCommands` 同名让位设计正是为本次收敛预留的接口。

## 背景与现状事实（探查结论）

- **T25 现状**：Pai 渲染层本地注册 `/compact`（目录合成 + 提交拦截分派 `session/compact`），hub 侧零改动。遗留约束：命令目录真相分裂在两层（hub 三源 + 本地 builtin）、`/compact` 误发保护依赖渲染层词法。
- **hub prompt 是 fire-and-accept**：`handlePrompt`（`src/worker-commands.ts:131-165`）经 SDK preflight 钩子在接受时刻回包，接受后失败走事件流；`/skill:` 指针化改写就在此层（`src/skill-pointer.ts`，前缀 + 空格分词 + 精确名匹配、未知透传）。
- **compact 是长操作**：`handleCompact`（worker-commands.ts:209-220）inflight 注册 `abortCompaction`、完成才回包；SDK 错误（`"Already compacted"`、`"Nothing to compact (session too small)"`）沿全局 catch 变 failure error string。
- **能力门控缺口**：`collectCommands(thread)` 拿不到后端能力——capabilities 只在 `WorkerBackend` 上（worker.ts:426 分发器门控用），`PaiThread`/`PaiSession`/`WorkerContext` 均无查询面；pi-agent-core 后端无 `session.compact` 位（compact 命令被门控拒绝、session 是 unsupported 桩）。
- **压缩态可查**：`session.isCompacting` 是 port 成员（内存 getter，含手动/自动/branch summary）。
- **无 reason 词表**：`ResponseFrame` 只有 `error?: string`，全部错误是英文句子透传（design.md:34-36 承诺中性英文）。
- **文档既有矛盾**：design.md:299 称 skill 改写在「host 侧」，实际在 worker 侧——本批顺手同变修正。

## 目标形态

用户在 Pai 输入 `/compact`（可带附加指示文字）→ 提交走 `session/prompt`（普通消息通路，与 skill 一致）→ hub `handlePrompt` 拦截首 token → `session.compact(customInstructions)` → 完成回包，`compaction_start/end` 事件照常流出（Pai 横幅既有消费不变）。Pai 渲染层删除本地命令注册表与提交分派（T25 桥下线），命令目录真相单一回归 hub。

## 契约

### hub 协议（唯一真相 docs/design.md，先改文档再改代码）

1. **get_commands 第四源**：`SessionCommand.source` 词表新增 `'builtin'`；目录新增条目 `{ name: 'compact', description: 'Manually compact the session context', source: 'builtin' }`（description 复用 SDK `BUILTIN_SLASH_COMMANDS` 同名文案；name 无前导斜杠，与三源约定一致）。条目按 `session.compact` 能力位门控——不支持的后端不出现（pi-agent-core 目录里没有 /compact）。
2. **prompt 通路拦截语义**（design.md「恰好一次」节新增例外条款）：
   - 词法：严格行首、大小写敏感——`message === '/compact'` 或 `/^\/compact\s/.test(message)`；`customInstructions` = 后随文本 trim 首尾（内部空白原样）；不命中（`/compactfoo`、前导空白、`/COMPACT`）原样作为消息发送，与未知 `/xxx` 一致。
   - **响应时序按 compact 型**（长操作完成才回包，非 fire-and-accept）：拦截路径注册 inflight（`abortCompaction`，shutdown 中止语义继承），成功回 `CompactionResult`、失败回 failure error string。
   - 携 `images` → failure（压缩命令不接受图片，固定英文句）。
   - 压缩中（`session.isCompacting`）→ failure `'Compaction already in progress'`。
   - 能力不支持 → **不拦截**（原样作为消息发送；目录本无条目，手输属未知命令）。
   - **拦截优先于 pi 扩展命令**（hub 层先于 SDK `_tryExecuteExtensionCommand`；与 skill 指针化同层同优先级——扩展注册 `compact` 命令的冲突场景属边缘，落档此裁决）。
3. **能力面**：`WorkerContext` 新增 `capabilities`（buildContext 组装时来自 backend），供 `handleGetCommands` → `collectCommands(thread, capabilities)` 过滤内置条目（`prompt`/`compact` 均核心必选命令、不经分发器能力门控，故必须自带判定）。
4. **不新造 reason 词表**：错误沿用 error string 透传（`'Compaction already in progress'`、SDK 既有句子、capabilityError 模板），与 hub 现状一致。
5. 文档同变：design.md 命令表（prompt 行为注记）、get_commands 三源改四源、「恰好一次」例外条款、299 行 host/worker 措辞修正；api.md `source` 枚举同步。

### Pai 侧（hub 提交后同日批次）

- **contracts 镜像**：`CommandViewSchema.source` 枚举加 `'builtin'`（`packages/contracts/src/api.ts`）；`packages/adapter/src/response-views.ts` 的 `sessionCommands` 收窄白名单加 `'builtin'`（不加则 hub 下发条目被静默丢弃）。
- **删除面**（T25 桥下线，单轨）：
  - `composer/builtin-commands.ts` 整文件（注册表/合成/词法）与测试；
  - `screens/submit-draft.ts` 的 builtin 分派分支与 `commandUnhandled`；
  - `live/workspace-actions.ts` 的 `compact` 动作与 compactBusy 判态、`live/live-controller.ts` 的 `compact` 方法及测试；
  - `apps/electron/src/main/api-routes.ts` 的 `'session/compact'` 路由与 `ApiSchemas` 条目（渲染层→主进程 RPC 面，无人调用即删；`hub-protocol.ts` 的 `CompactCmd` 镜像**保留**——协议真相全集，含 `customInstructions`）。
- **保留/改形面**：
  - `command-groups.ts` builtin 分箱归「命令」组（类型回退 `CommandView[]`，枚举已含 builtin）；高亮/补全/原子删除零改动（目录驱动机制不变）；
  - `isImmediateSubmit` 词法化：`'! '`（trimStart 后）**或消息以 `/` 开头**即不入生成中暂存——命令族通用语义（命令即时生效，排队无意义），不再依赖注册表清单；
  - `/compact` 经 prompt 失败提示走 `sendFailed(reason)` 通用通路（error string 自描述，不复用 compactFailed）；压缩中横幅、`compaction_start/end` 折叠消费不变。
- **strings**：删 `composer.builtinCompactDescription`、`flow.compactBusy`、`flow.compactNoImages`、`flow.commandUnhandled`（`flow.compacting` 横幅与 `flow.compactFailed` 保留——后者仍有消费点吗：删 actions.compact 后无人引用，一并删，实施时以 grep 对账）。

## 问题域

- 处理：hub 目录条目与能力门控、prompt 拦截全语义（词法/时序/inflight/images/压缩中/优先级）、双仓库文档与镜像同变、Pai 删除面与词法化收口、兼容矩阵验证。
- 不处理（归属）：
  - TUI 与 pi rpc-mode 的 `/compact`（SDK 侧既有机制，保持不动；本次只在 pai hub 的 prompt 编排层拦截）；
  - 其他 builtin 命令（/subagents 等）提升进目录——仅入驻 compact 一条，后续按需逐条走同型流程；
  - pi-agent-core 后端的压缩支持（unsupported 照旧，目录无条目即无入口）；
  - `reason` 结构化词表（hub 全局改造，超出本批）；
  - 自动压缩（threshold/overflow）与 branch summary 的任何行为。

## 并发/一致性预算

- hub：拦截路径 inflight 注册（shutdown abort 恰好一次响应语义继承）；`isCompacting` 判定与 `compact()` 调用之间存在受理窗口（同 T25 P2-3 形态）——窗口内二次提交直达 SDK，以 SDK 并发行为兜底（错误句子透传，不崩溃、不双压缩；实施时验证并发调用形态并补测试锚定）。
- streaming 中 `/compact`：`session.compact()` 在流式中的行为未探明——实施时验证（预期 SDK 拒绝或排队，错误透传即闭环）；方案不预置流态判定。
- Pai：净删除，无新定时器/IO/状态。

## 拆分（文件面）

- **hub（/Users/wrr/work/pi/app，用户在 `t26-compact-hub` 分支完成）**：`src/command-listing.ts`、`src/compact-invocation.ts`（新，词法与拦截单一真相）、`src/worker-context.ts`、`src/worker.ts`、`src/worker-commands.ts`、`docs/{design,api,worker-contract}.md`、`test/{command-listing,compact-intercept}.test.ts`、`test/e2e.mjs`。
- **Pai（本仓库）**：`packages/contracts/src/{api,commands}.ts`、`packages/adapter/src/response-views.ts`、`apps/electron/src/main/{api-routes,pai-runtime,auto-title(新)}.ts`、`renderer/src/live/{live-controller,workspace-actions,use-live-workspace}.ts`、`renderer/src/composer/{builtin-commands(删),command-groups,command-highlight,prompt-input-area,composer,composer-actions-row}.ts(x)`、`renderer/src/screens/submit-draft.ts`（`workspace-main` 行为经 `isImmediateSubmit` 隐式变化，仅注释同变）、`renderer/src/strings/{zh,en}.ts`、`tasks/T10` 面表、对应 `__test__`。

### B2 对抗审查处置（2026-09-10，问题清零）

- P1-1 prompt 通路 30s 默认超时会误杀 compact 完成时序（大上下文压缩可远超）→ `session/prompt` 路由放宽至 10 分钟（`PROMPT_REQUEST_TIMEOUT_MS`；普通 prompt 接受时刻回包不受影响）。
- P1-2 拦截型 `/compact` 成功会触发自动命名、把未命名会话改名为命令文本 → 标题语料判定提纯 `main/auto-title.ts`：行首 `/` 非标题语料（斜杠命令族一并根治），回归用例锁症状。
- P2-1 `PaiCommandType` 删 `'compact'`（Pai 实际发出的命令子集不再含它；hub 全量词表镜像保留），T10 面表同变。
- P2-2/P2-3 注释漂移三处修正、`' /compact'` 前导空白边缘补回表驱动并落档「轮末冲刷时 trim 后仍被 hub 拦截」取舍；`sendFailed` 的「请重试」文案对 'already in progress' 类拒绝非最优建议——通用文案不针对单场景定制（裁决 F 延续），error string 自描述可接受，落档不改。

## 实施顺序

1. **B1 hub 批次**（独立可用，旧 Pai 不受影响——其 adapter 白名单会把 builtin 条目降级丢弃，行为不变）：文档（design.md/api.md）→ WorkerContext.capabilities → collectCommands 门控 → handlePrompt 拦截 → 测试。门禁 `npm run ci`（check + build + test：单测/smoke/e2e-mock/conformance）。
2. **B2 Pai 批次**（同日，hub 提交之后）：contracts 镜像 + adapter 白名单 → 删除面（注册表/分派/调用链/strings）→ isImmediateSubmit 词法化 → 测试改造。四门 + 对抗审查（跨仓库协议面）。
3. **B3 真机联调验收**：裸 /compact、带指示、压缩中重复、生成中、携图、pi-agent-core 后端目录、旧 hub 退化（/compact 原样发送不炸）。

## 裁决（默认裁决，否决窗口随定稿）

- A：**拦截后响应按 compact 时序**（完成才回包）而非 fire-and-accept——与协议 compact 命令同型、Pai 失败提示链路复用 prompt failure 通路、避免「接受即回但压缩失败只能靠事件流补通知」的隐藏成本（T24 已知 bug e 同类）。
- B：能力门控放 **WorkerContext**（buildContext 组装）而非 PaiSession port——port 面零改动，注入面最小。
- C：能力不支持时**不拦截**（原样发消息）——与未知命令语义一致，不制造「目录没有但手输报错」的特殊分支。
- D：hub 拦截**优先于 pi 扩展命令**——与 skill 指针化同层；扩展注册 compact 的冲突属边缘。
- E：Pai `isImmediateSubmit` 词法化为「`/` 开头即不入暂存」——命令族通用，不依赖运行时目录。
- F：不新造 reason 词表（error string 透传，hub 全局现状）。

## 测试口径

- **hub**：
  - 词法表驱动：命中（裸/单空格/多空白/换行分隔）与不命中（`/compactfoo`、`/compact-x`、`/COMPACT`、前导空白、文中段）；
  - customInstructions 透传断言（trim 首尾、内部原样、空串 → undefined）；
  - 能力矩阵：pi-coding-agent 目录含 builtin 条目 / pi-agent-core 不含；
  - 时序：拦截路径完成才回包（mock-model 装置）、inflight abort（shutdown 中止路径）、`compaction_start/end` 事件照常流出；
  - 错误表：压缩中 `'Compaction already in progress'`、携图固定句、SDK `"Nothing to compact..."` 透传；
  - 优先级：注册名为 compact 的扩展命令时 hub 拦截优先（如有装置面，否则文档锚定）。
- **Pai**：
  - 契约：`CommandViewSchema.source` 含 builtin；`sessionCommands` 白名单透传 builtin 条目（垃圾 source 丢弃不回归）；
  - 分箱：builtin 归「命令」组（既有用例改 `CommandView` 字面量）；
  - 删除面回归：全仓 grep `builtin-commands|parseBuiltinCommand|commandUnhandled|compactBusy` 零残留；`session/compact` 不在 ApiSchemas；
  - `isImmediateSubmit` 表驱动：`! `/`/` 开头各形态、普通消息、空文本；
  - 回归：生成中 `/compact`（及任意 `/xxx`）不入 queuedDrafts；hub 旧版退化（目录无 builtin、/compact 原样走消息）不崩。
- **假绿抽查**：两仓库新增断言逐条对读，无 skip/静音。

## 风险与兼容矩阵

| 组合 | 行为 |
| --- | --- |
| 旧 Pai × 新 hub | 目录 builtin 条目被 adapter 白名单丢弃（降级安全）；无 /compact 入口，行为同现状 |
| 新 Pai × 旧 hub | 目录无 builtin 条目；手输 /compact 原样作为消息发送（hub 不拦截）——退化为 T25 之前的误发风险，联调窗口内收敛，B1/B2 同日提交 |
| conformance 参考实现 | 固定回空目录（test/conformance/reference-worker.mjs:111-113），不受影响 |

## 与 T25 的关系

T25 状态推进「已核销」并加注：裁决①经用户裁决推翻，渲染层拦截桥（builtin-commands）由本任务 T26 B2 整体下线；T25 的 customInstructions 契约扩展随调用链删除（hub-protocol 镜像保留）。本任务定稿后同一提交内先改 T25 文档再动代码。
