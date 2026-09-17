# T38 — pi-hub → host-hub 后端全量替换

> 状态：定稿（对抗审查 H1-H3/M1-M7/L1-L7 全处置，处置记录见 §8）
> 状态流转：草稿 → 定稿（对抗审查清零）→ 实施中 → 已核销（验收清单全勾）
> 迁移源：后端进程 `/Users/wrr/work/pi/app`（pai-cli）→ `/Users/wrr/work/my-agent/packages/host-hub`（下称 host-hub，协议 v1）
> 本文档为三件套合一：§1-3 = DESIGN（契约基线），§4 = IMPLEMENTATION（裁决表与实施顺序），§5-7 = MIGRATION（对照、矩阵、回滚），§8 = 审查处置。

## 0. 定位

把 Pai 的唯一后端进程从 pi-hub 换成 host-hub：**全量替换，零兼容层**。app（contracts/adapter/infra/main/renderer/testkit）五个面同步演进；pi-hub 退役后 app 仓库内不再有任何 pai 协议残留。host-hub 是 pai-cli 的直系演进（其仓库 MIGRATION.md 已核销 pai→host-hub 迁移，含客户端迁移指引 §7），协议差异全部有档可查——本任务 = 按该差异面重写 app 侧消费面。

**规格真相源 = host-hub 代码**（`protocol/commands.ts` COMMAND_NAMES + `protocol/frames.ts` + 各 handler 实现行为）。注意：host-hub 仓库自身文档（MIGRATION.md/DESIGN.md）有三处与代码不符的陈旧表述（get_subagents 字段、subagent/steer 用 agentName、ui_request 保留 select/input/notify/setStatus）——**一律以代码为准**，文档对拍不作为验收依据。

**外部事实（已实测验证，2026-09-17）**：

- host-hub 编译形态（`bun build --compile`，68MB 单文件）全链路可用：`get_host_info` 应答、`thread/start` spawn worker（`/$bunfs/` 自 spawn 分支）、faux provider、stdin EOF 优雅退出 exit 0。
- 两侧 bun 同版本 1.4.2（my-agent 开发 bun 与 app `resources/bun/bun` 一致）。
- host-hub 源码形态：`bun <my-agent>/packages/host-hub/src/host/cli.ts` 直接可跑（bun 原生 TS；模块解析走 my-agent/node_modules）。
- sessionPath 布局：`<HUB_AGENT_DIR>/sessions/<id>/transcript.jsonl`（协议事实）。

## 1. DESIGN — 外部契约基线

### 1.1 命令面（app 实际消费子集见 §5.1；全集 = COMMAND_NAMES，不在此重复计数）

- 帧基契约不变：JSONL over stdio、`type`+`id`、response 恰一（关闭期在飞不补）、心跳 1Hz 监督、stdin EOF 优雅停机。
- `thread/start`：入参 `{cwd?, modelId?, trusted?, permissionMode?, thinkingLevel?}`——**无 provider 字段**（modelId 裸 id 三级消歧）；响应 `{threadId, cwd, sessionPath, projectSettingsPresent?}`（app 显式忽略 projectSettingsPresent——信任引导 UX 由 app 自有 trusted 流程承担）。
- `thread/resume`：`{sessionPath(必填，`…/<id>/transcript.jsonl` 词法围栏), cwd?, trusted?, permissionMode?, thinkingLevel?}`。
- `prompt/steer/follow_up`：**普通消息**受理即空 data 应答，终态 = `settled` 事件 `{sendId=命令id, ok, reason?}`（worker 死亡 host 合成 ok:false，无悬挂）；流式中 prompt 必须带 `streamingBehavior`（hub 判定 = `pendingSends>0 ∨ isStreaming`，含「response 已发而 turn/start 未达」的受理窗口）；images 块 `{type:"image", data, mediaType}`（**mediaType 非 mimeType**）。**行首 `/compact` 消息被拦截**：该路径响应在压缩完成后才发、**无 settled 事件**（终态 = 响应本身）——app 必须本地预判该词形（trim 后行首 `/compact`，与 hub `interceptCompact` 同规则）走长超时 + 以响应为终态。
- `get_entries`：入参 `{threadId, since?: number(seq), before?: number, limit?(1..5000)}`；响应 `{entries: [{seq, ts, event: SessionEvent}], leafSeq, hasMore}`；**游标 = WAL seq（整数），未知 seq 显式失败**。
- `get_state`：`{model: {provider, modelId}|{modelId}, isStreaming, isCompacting, sessionId, sessionName, sessionFile, messageCount, queue: {steering: string[], followUp: string[]}}`——**无 thinkingLevel**。
- `get_inflight`：`{turnStartSeq|null, turnStartedAt|null, message|null, toolOutputs[](≤8×64KiB), bash|null}`。
- `get_subagents`：`{subagents: [{agentId, agentName, work, status: busy|idle|on-disk, runId, sessionId, createdAt, lastActiveAt, agentType?}]}`。
- `fork`：入参 `{threadId, seq(≥1), position?: before|at}`；响应 `{threadId, previousThreadId, sessionPath}`——**无 text/cancelled；流式中拒绝（`thread is streaming`，先 abort）**。
- `bash`：`{threadId, command, timeoutMs?(0..86400000), excludeFromContext?, id?}`；响应 `{output, exitCode, cancelled, truncated, fullOutputPath?}`（64KiB 内联截断 / >1MiB 溢写）。**bash 的执行 id = 命令关联 id**，app 的 request 层自动分配 id 且 encoder 以关联 id 覆盖命令对象——app 无法定向指定 ⇒ `abort_bash` 只用**全量中止**语义（无 id），定向面不接入（见 D14）。
- `set_idle_retire_ms`：**入参 `{value}`（非 ms）**，clamp 回显。
- `set_model`：provider 必须精确等于目录 providerId（custom 条目 = models.json 的 provider 字段值）；**下一 turn 生效**（append model-change 事件）——UI 模型指示需容忍「已设置/下一轮生效」的错位窗口。
- `get_host_info`：`{version, bunVersion, pid, uptimeMs, rssBytes, threads{live,parked,dead}, limits{6 键}}`——无 piVersion/backend。
- `thread/list`：无 `subagents` 字段；`thread/list_saved`：入参全键查询 + 游标，响应 `{sessions: SessionSummary[]}`（含 id/title/cwd/model/forkParent/depth/messageCount/lastSeq/archived，**不含 sessionPath**——app 侧按 `<agentDir>/sessions/<id>/transcript.jsonl` 布局事实重建，注释注明布局契约出处）。
- `get_models`：扁平数组 `[{id, provider, contextWindow, maxTokens, cost?, source: preset|custom}]`（**无 reasoning 能力位**——思考档可用性无法预判，见 D4）。
- `ui_response`：`{requestId, payload: {confirmed: boolean}}`。
- `subagent/steer`：**入参 `{threadId, agentId, message}`**；语义 = 轮边界投递，非驻留/非 busy 拒绝。
- 设置面与工作区：`settings/get|set`（键白名单 3：permission.defaultMode / thinking.default / skills.disabled；带 cwd = 项目级须已信任）、`permission/get_mode|set_mode`（会话级 4 档）、`set/get_thinking_level`（**set 词表 = off|low|medium|high（不接受 unset）；get 为单数**，`{level: off|low|medium|high|unset, source: session|project|user|unset}`；thread/start 的 thinkingLevel 词表外值**静默降级不落盘**——app 发送前自行校验词表）、`models/add|remove`（app 不消费，见 D2）、`agents/create|remove|list`、`skills/list|set_enabled|remove`、`workspace/trust`、`set_rss_retire_bytes`。
- models.json（app 直写，形状 = host-hub readCatalog 认识的字段）：`{models: [{id, provider, api, baseUrl, apiKeyEnv, contextWindow?, maxTokens?, reasoning?, input?, cost?}]}`。**provider 字段 = 目录 providerId（分组键 + set_model 寻址键）**；撞 host-hub 预设键（现库 = `glm`）的 custom 条目被 readCatalog **静默剔除 + degraded**（get_models 附发 hub_error、仅预设可用）——app 写前必须镜像校验拒名（见 D2）。api 词表 = `anthropic-messages | openai-completions`（app 侧 upsert 校验收口）。

### 1.2 帧与事件词表（7 帧）

- 帧集：`response | event | ui_request | heartbeat | hub_error | thread_died | thread_parked`。**subagent_event / subagent_message 帧摘除**。
- `event` 帧形状：`{type:"event", threadId, name, payload, agentName?}`——payload 展开（无 event 嵌套），agentName 仅子代理中继时存在（agents/idle 信封固定 agentName="manager"）。
- app 消费的事件词表：`assistant/stream`（payload.type = start|thinking_start|thinking|thinking_end|text_start|text|text_end|tool_use_start|tool_use_input|tool_use_end|usage|done{stopReason,usage,provider?,model?}|error）、`tool/start|result|progress`、`turn/start|end`、`step/start|end`、`settled`、`inbox/spliced{queue: nextTurn|nextStep, op: push|claim|drop, ids}`（结构信号无文本）、`compaction{generation,replacedCount,layer?,trigger?}`（单事件）、`llm/retry{stepId,attempt,delayMs,reason}`、`permission/decision`、`agents/spawned|state|terminal|evicted|user-injected|idle`（payload 带 agentId/agentName/runId；idle 载荷键是 `agents`）、`bash_execution_update{id,delta,truncated?}`。
- app **忽略**（显式不消费，转发兼容策略 = 未知事件名一律忽略）：`hook/error`、`request/start`、`step/start|end`（若无需细粒度）、`plugin/<名>/*` 动态域全量。
- `agents/permission-ask{agentId,agentName,askId,toolName,summary,reason}`：子代理权限请求**只有事件、协议无应答命令**（hub 侧到期默认拒绝）——app 裁决：agent 面板信息展示（「等待确认，超时自动拒绝」），不提供应答交互。
- `heartbeat`：`{rssBytes, cpuPercent}`——**无 subagents 计数**（在途徽标改 agents/state 事件 / get_subagents）。
- `hub_error`：`{type, message, threadId?}`——**字段是 message（非 scope/error）**。
- `ui_request`：**仅 method=confirm**，载荷平铺 `{tool, summary, reason}`；超时 5min 默认拒绝。
- `thread_parked.reason` 增加 `rss`。

### 1.3 环境与进程契约

- `HUB_AGENT_DIR`（必需；sessions/models.json/credentials.json/hub-settings.json/trusted-workspaces.json/bash-outputs 全落此树）；`HUB_SESSIONS_ROOT`（缺省 `<agentDir>/sessions`，app 不设）；旋钮 `HUB_MAX_THREADS/HUB_IDLE_RETIRE_MS/HUB_WORKER_STALE_MS/HUB_WORKER_EXIT_TIMEOUT_MS/HUB_RSS_RETIRE_BYTES/HUB_BASH_TIMEOUT_MS`（坏值降级缺省）。
- worker = 同一可执行体 `--internal-worker` 自 spawn（源码/产物/编译三形态自解）。
- 测试注入：`HUB_WORKER_PROVIDER=faux` + `HUB_FAUX_SCRIPT`（JSON 剧本 steps：`{kind: reply|tool-calls|error|truncated|delay, …}`）。

## 2. DESIGN — 方向性裁决（默认裁决；审查复核过）

- **【D1】二进制集成**：dev = bun 直跑 my-agent 源码形态 `src/host/cli.ts`（零构建热迭代；**不用 dist 产物**——dist `--external @my-agent/*` 只能原地跑，src 形态同样原地但免构建；探测次序 src > dist 是有意翻转，理由即此）；打包 = sync-resources 从 my-agent 源路径 `bun build --compile` 出单文件可执行进 `resources/host-hub/host-hub`。spawn 形态扩展：`HostRuntimeConfig.hubEntry` 类型放宽 `string | null`（null = 直执行，`spawn(bunPath, [])`，bunPath=编译产物）；`settings.hubDev` 形状同步（entry 为空串/null 语义 = 直执行）。`resources/bun/` 保留（hubDev 指向脚本形态时仍需 bun；dev 形态用系统/配置 bun）。
- **【D2】渠道与凭据真相源不变**：app 仍是唯一渠道真相与 models.json 唯一写者（`models/add|remove` 不消费，避免双写者）。`writeModelsConfig` 重写为 §1.1 形状：`provider` = 渠道名（同时是 providerId/set_model 寻址键，model/list → set_model 全链同源派生）；`apiKeyEnv` = `PAI_KEY_<NAME>` 引用（key 经 spawn env 注入，hub envFor 进程 env 兜底，不落盘）；**写前校验三道**（镜像 host-hub models-admin，app 侧收口）：渠道名撞 hub 预设键拒（预设键集合运行期从 get_models `source:"preset"` 的 provider 集派生，冷启动缓存）、api 词表校验、数值正整数校验。ProviderConfig 的 `thinkingFormat/compat` 字段退役（host-hub 无此面）；`modelOverrides` 不写（app 的 contextWindow/maxTokens 内联条目，overrides 是 set_model_override 命令域，app 不消费）。GLM 预设保留为 hub 内置，app 渠道列表不依赖预设（真模型一律 custom 条目）。
- **【D3】权限面模式化**：pai 规则域（全局 permission-rules.json + 会话 sidecar get/set_permission_rules）整体退役，`agent-dir-files.ts`（ALLOWED_FILES 只服务这两个退役域）随之删除。新面：T14 会话模式操作栏 → `permission/set_mode`；thread/start 带 `permissionMode` 初值；用户级默认 = `settings/set permission.defaultMode`；项目级 = 带 cwd 的 settings/set。全局规则编辑 UI 删除，替换为「默认模式」设置项。`contracts/permissions.ts` 收缩为 PermMode 词表。
- **【D4】思考档 4 档**：7 档（off…max）→ `off|low|medium|high` + unset（**仅 get 回退值**，set 不接受 unset）。thread/start 带 `thinkingLevel` 初值（app 发送前自行校验词表——hub 对词表外值静默降级）；运行期改档 `set_thinking_level`（**在飞拒绝 + hub 侧 dialSupportsThinking 校验拒绝**（模型不支持/预算超限）——两路失败都降级为 UI toast，菜单恒 4 档可选不预判能力，app 自有渠道可用 ProviderConfig.reasoning 提示性灰显但不硬禁）；读口 `get_thinking_level{level, source}`；用户级默认 `settings/set thinking.default`；模型级 effortLevelsForModel 本地推导退役。
- **【D5】技能面 hub 化**：app 本地 skills-catalog/skills-inventory（pi 语义）退役 → `skills/list|set_enabled|remove` 命令。设置页技能开关与新任务页预构命令目录改走命令。
- **【D6】子代理定义面 hub 化**：app 文件面（`<agentDir>/agents` + `<项目>/.pi/agents` + pi frontmatter 格式）退役。user 级 CRUD → `agents/create|remove`（hub 写 `~/.my-agent/agents/<name>.md`，严格四字段 frontmatter）；枚举 → `agents/list`（live 线程带 cwd 时含 project 级）；project 级 CRUD = app 直写 `<cwd>/.my-agent/agents/<name>.md`（hub 格式热发现），**app 侧自带同规校验**（NAME_PATTERN `^[a-z0-9]+(-[a-z0-9]+)*$`、保留名 fork/main、description ≤500 字符、四字段 frontmatter）——hub 对坏文件是静默跳过 + stderr warn，无校验则用户定义静默消失。
- **【D7】settled 驱动（含 /compact 特例与受理窗口竞态）**：`session/prompt` 的 APIOutcome 语义 = 受理；终态信号 = `settled{sendId, ok}`（sendId = host.request 自动分配的命令 id），pai-runtime 按 sendId 关联在途 prompt + 派发 turnSettled。**特例：app 本地预判行首 `/compact` 词形（trim 后行首，与 hub interceptCompact 同规则，注释注明单源出处）——该类 prompt 以响应为终态、不等待 settled、保留长超时（压缩是同步长操作）**。**受理窗口竞态：app 的 streaming 状态来自事件流、天然滞后于 hub 受理窗口（`pendingSends>0`）**——prompt 路由对 `"streamingBehavior required while streaming"` 错误做**恰一次自动重试**（补 `streamingBehavior:"followUp"` 重发），重试仍败才上抛 UI。
- **【D8】队列 UI 双信号**：`inbox/spliced`（结构信号，触发一次 get_state 拉取）+ `get_state.queue {steering, followUp}`（文本快照）→ queueChanged UiEvent。
- **【D9】fork seq 化**：app API `session/fork` 入参 entryId → seq（渲染层从 entries 的 seq 取）；流式中 fork 拒绝的 UI 处理 = 先 abort 提示；cancelled/ABA 分支删除。
- **【D10】通知域收缩**：ui_request 仅 confirm；pai 的 notify/setStatus 对话框与 app 通知条 dialog 来源退役（`notifyIfBlurred` 的 notify/setStatus 分支删除；失焦系统通知保留给 bashOutput 等自有信号）。对话框 UI 收敛为 confirm 单形态。
- **【D11】旧 pai 会话不迁移**：pai 会话文件（pi WAL）与 host-hub 会话（内核 WAL）不兼容；不做格式转换器。后果：升级后旧会话列表为空、旧 sessionPath 不可 resume（hub 显式 failure）——registry 旧行在启动对账时按 resume 失败收敛移除。**显式挂账**。
- **【D12】存储断言口径**（W6 验收用）：会话 = `<HUB_AGENT_DIR>/sessions/<id>/transcript.jsonl`（JSONL，含 session_init/message/tool_result 事件）；注册表 = app 自有 registry.sqlite；渠道 = models.json（hub 形状）；技能开关 = `<HUB_AGENT_DIR>/hub-settings.json` skills.disabled；agent 定义 = `~/.my-agent/agents/*.md`（测试 HOME 重定向隔离——bun test 每文件独立进程，文件内改 `process.env.HOME` 不跨文件污染，HOME 敏感断言集中在专属文件）。
- **【D13】abort_bash 全量语义**：见 §1.1——定向中止面不接入（app 无法指定 bash 执行 id），保留「中止全部在跑」。
- **【D14】未知事件转发兼容**：event 帧事件名不在 app 消费词表内 → 静默忽略（前向兼容：host-hub 新增事件不炸老客户端）。

## 3. DESIGN — 不处理清单（归属显式）

| 不处理 | 归属 |
| --- | --- |
| OAuth / 后端协商 / PAI_BACKEND | 域已随 pi 退役（host-hub 无此面） |
| pai 规则 JSON 的迁移/转换 | D3：域退役，无转换义务 |
| 旧 pai 会话格式转换 | D11：显式挂账不迁移 |
| host-hub 内核行为（WAL/压缩/恢复） | my-agent 仓库职责，app 只消费协议 |
| models/add|remove 命令消费 | D2：app 是 models.json 唯一写者 |
| thinkingFormat/qwen|zai 思考参数兼容 | host-hub provider 面无此参数，字段退役 |
| notify/setStatus 对话框 | D10：域退役 |
| agents/permission-ask 应答交互 | §1.2：协议无应答命令，仅信息展示 |
| bash 定向中止 | D13：id 机制不可达，全量语义 |
| projectSettingsPresent 信任引导 | §1.1：app 自有 trusted 流程承担 |
| host-hub 索引 DB（store-index-sqlite） | host-hub 未接线，app 不感知 |

## 4. IMPLEMENTATION — 裁决表与实施顺序

### 4.1 文件级裁决

**口径**：下表列**协议直接依赖点**；表外文件按「§5.1/§5.2 差异表驱动 + import 依赖图跟随改写」（typecheck + grep 清零是完备性门，见 §6）。

**重写**（协议词汇级变化，测试同步重写）：

| 文件 | 裁决理由 |
| --- | --- |
| `contracts/src/hub-protocol.ts` | 镜像整体换 host-hub v1（命令/帧/载荷类型） |
| `contracts/src/commands.ts` | 发送子集重列（+settings/permission/skills/agents 命令；-navigate_tree/get_sandbox_state/get·set_permission_rules/get_thinking_levels） |
| `contracts/src/thinking-levels.ts` | 4 档 + unset 词表（set/get 词表区分） |
| `contracts/src/api.ts` | fork entryId→seq、images mediaType、thinkingLevel 映射删除、thinkingLevels API 面、subagents 视图词表 |
| `contracts/src/runtime.ts` | heartbeat 无 subagents、get_host_info 形状、thread/list 无 subagents |
| `contracts/src/inflight-views.ts` | subagentId→agentId、状态词表 busy\|idle\|on-disk |
| `contracts/src/agents.ts` | `.pi/` 布局 → `.my-agent/` 布局 + hub 四字段格式 |
| `adapter/src/event-mapper.ts` | 内核词表 → UiEvent 全表重写（§5.2） |
| `adapter/src/entries-mapper.ts` | seq 域 + 内核 SessionEvent（15 种）→ HistoryItem |
| `adapter/src/dialog-mapper.ts` | confirm 单形态 |
| `adapter/src/command-encoder.ts` | 入参差异（mediaType/value/agentId/seq/无 provider） |
| `adapter/src/frame-decoder.ts` | 7 帧 + hub_error.message |
| `adapter/src/response-views.ts` | thinkingLevel/subagentId/词表消费面全换 |
| `adapter/src/content.ts` | mimeType → mediaType（跟随 wire 词法） |
| `main/models-config.ts` | hub 形状 + D2 三道写前校验 |
| `main/api-routes.ts` | 命令增删改 + 权限/思考/技能/fork 面 + /compact 特判（D7）+ 受理窗口重试（D7） |
| `main/pai-runtime.ts` | settled 关联、hub_error、队列快照、对账收敛（D11） |
| `main/agent-definitions-store.ts` | user 级走命令 + project 级 hub 格式直写 + D6 同规校验 |
| 渲染层 `live/fold-events.ts`、`fold-subagents.ts` | 内核词表折叠 + agentName 分流 |
| 渲染层 `live/entry-hydration.ts`、`read-ports.ts`、`fold-hydrate.ts`、`hydrate-items.ts` | seq 游标 + 新响应形状 |

**微修**：

| 文件 | 变更 |
| --- | --- |
| `infra/host-process/create-host-process.ts` | `PI_CODING_AGENT_DIR`→`HUB_AGENT_DIR`；直执行形态（hubEntry null → 无参 spawn） |
| `contracts/src/ports.ts`、`contracts/src/settings.ts` | hubEntry `string\|null` + hubDev 形状同步 |
| `main/hub-paths.ts` | dev 探测 `../my-agent/packages/host-hub/src/host/cli.ts`（源码形态，翻转理由见 D1）> dist；打包 `resources/host-hub/host-hub`（直执行） |
| `main/pai-runtime.ts` `buildHost()` | env 键改名 + 直执行分派 |
| `main/runtime-monitor/*` | get_host_info/thread_list 字段适配；在途徽标数据源换 agents/state |
| `main/api-routes-runtime.ts` | retire/forceRetire/setKeepalive/setIdleRecycle 字段微调 |
| `main/api-routes-settings.ts` | provider 写盘走新 models-config（撞预设键/api 词表校验）；provider/test 不变 |
| `main/index.ts` | packagedEntry 路径 + notifyIfBlurred 死分支删除 |
| `main/paths.ts` | 注释与 agentDir 语义说明更新 |
| 渲染层组件（权限模式菜单/思考档菜单/agent 面板/队列横幅/命令面板/workspace-fork/workspace-actions/live-controller fork 调用点） | 数据源与词表适配 |
| `infra/__test__/fake-host.ts` | 帧词表对齐（heartbeat/hub_error 字段） |
| `scripts/packaging/sync-resources.ts` | host-hub 编译产物（源 = my-agent 路径，env 可覆写） |
| `apps/electron/electron-builder.yml` | extraResources 布局与注释（resources/host-hub） |
| 渲染层 `strings/en.ts`、`zh.ts` | 「pai-cli 路径」等用户可见文案更新 |

**删除**：

| 文件/域 | 理由 |
| --- | --- |
| `main/skills-catalog.ts`、`skills-inventory.ts` | D5 域退役 |
| `main/agent-dir-files.ts` | ALLOWED_FILES 仅服务退役的规则/全局设置两域（D3） |
| `agent-definition-file.ts` 的 pi frontmatter 解析 | D6 换 hub 四字段格式 |
| `contracts/permissions.ts` 规则域类型 | D3 收缩为 PermMode |
| `adapter/src/subagent-spawns.ts` | subagent_event/subagent_message 帧摘除（逻辑并入 event-mapper 用例） |
| hub-protocol 中 navigate_tree/get_sandbox_state/get_thinking_levels/get·set_permission_rules/subagent 帧 | 命令/帧摘除 |
| 渲染层 notify 对话框 → 通知条路径 | D10 |
| `resources/pai-cli/` | 换 `resources/host-hub/` |

### 4.2 实施顺序（每波独立提交、四门全绿——无任何豁免）

1. **W1 二进制集成**：hub-paths + spawn 直执行 + env 改名 + sync-resources 编译 + 受影响单测同提交改写；真 hub 冒烟走 opt-in 集成测试（W6 一并成型前用临时脚本手工验证，不留红门）。
2. **W2 contracts**：协议镜像重写 + 词表封闭测试。
3. **W3 adapter**：mapper 族重写 + 夹具表驱动测试。
4. **W4 主进程**：api-routes/models-config/权限/技能/agents/settled 关联 + 单测。
5. **W5 渲染层**：折叠器/组件 + 单测。
6. **W6 集成 e2e（默认门）**：真 host-hub + faux provider，驱动全部 app API 面（§5.1 子集），断言落存储（D12 口径）+ 优雅停机 + 挂死重启对账。`runtime.integration.test.ts` 重写为 faux 默认门全接口旅程；GLM 真门保留 opt-in 形态。
7. **W7 收口**：对抗审查（diff 对照本档）+ 假绿抽查 + 四门数字如实 + 状态推进。

注：W1-W5 波间存在「 contracts 已换、main 未换」的中间态——每波提交点四门必须绿，中间态用**波内一次性成对改写**（协议类型与其消费点同波提交）保证；若波太大则向下细分提交粒度，不放宽门禁。

### 4.3 测试计划

- 词表封闭：contracts 三断言（命令/帧/UiEvent）照旧机制重写；**对拍基准 = host-hub `COMMAND_NAMES` 数组与 `frames.ts` 代码**（非文档，见 §0）。
- mapper 表驱动：event-mapper 按 §5.2 映射表逐行一用例；entries-mapper 用内核 SessionEvent 全 15 种形态夹具；dialog/encoder/decoder 同构。
- 每个 W4/W5 行为变化带回归用例（用例名注明 T38 与症状）。
- W6 集成：32+ API 面逐个驱动（走 api-routes 真翻译层 + 真 hub + faux），storage 断言逐项；HOME/agentDir 重定向隔离（每文件独立进程天然隔离，HOME 敏感断言集中专属文件）；faux 剧本覆盖 reply/tool-calls/error/delay。
- 覆盖率：门禁阈值不动（行/语句/函数 ≥90、分支 ≥85），只补不降。

## 5. MIGRATION — 对照与矩阵

### 5.1 app API 面 → host-hub 命令（变化项；未列 = 同形透传）

| app API | 旧（pai） | 新（host-hub） | 备注 |
| --- | --- | --- | --- |
| session/start | thread/start{provider,modelId} | thread/start{modelId, permissionMode?, thinkingLevel?} | provider 字段删除；初值直传 |
| session/prompt | prompt（应答=终态） | prompt（应答=受理）+ settled 事件终态 | **/compact 词形特判：以响应为终态、长超时（D7）**；受理窗口竞态恰一次自动重试（D7） |
| session/setModel | set_model（即时生效） | set_model（**下一 turn 生效**） | UI 指示容忍错位窗口 |
| session/entries | get_entries{since:entryId} | get_entries{since:seq} | 未知 seq 全量兜底（沿用兜底模式） |
| session/fork | fork{entryId} | fork{seq} | 响应无 text/cancelled；ABA 分支删 |
| session/setThinking | set_thinking_level 7 档 | set_thinking_level 4 档（在飞/能力双拒 → toast） | D4 |
| session/thinkingLevels | get_thinking_levels | get_thinking_level（单数，{level,source}） | |
| permission/sessionRead/Write | get/set_permission_rules | permission/get_mode\|set_mode | 语义从规则 JSON → 4 档模式 |
| （新）默认模式/默认思考档/项目级设置 | 无 | settings/get\|set | 设置页新增键 |
| skills/list\|setEnabled | app 文件面 | skills/list\|set_enabled | D5 |
| agent/definitions\|upsert\|remove | app 文件面（pi 格式） | agents/list\|create\|remove + project 直写 | D6 |
| subagent/steer | {subagentId} | {agentId} | busy-only 语义 |
| app/setIdleRecycle | set_idle_retire_ms{ms} | set_idle_retire_ms{value} | |
| session/bash\|abortBash | bash/abort_bash | 同名（**abortBash 全量语义**；响应 +truncated/fullOutputPath） | D13 |
| model/list | get_models（providers 嵌套） | get_models（扁平 id/provider/source） | 渠道过滤适配；预设键集合从此派生（D2） |
| session/state | get_state | 同名（字段差异 §1.1） | touchSession 的 thinkingLevel 回写删 |
| session/stats | get_session_stats | 同名（tokens 形状/无 contextUsage） | |
| session/subagents | get_subagents | 同名（{subagents} 包裹 + busy\|idle\|on-disk） | |
| dialog/respond | ui_response | 同名（payload {confirmed}） | |
| app/restartHost / session/retire / forceRetire / setKeepalive | 同名 | 同名 | |

### 5.2 事件映射表（pai → host-hub → UiEvent）

| pai | host-hub | UiEvent |
| --- | --- | --- |
| agent_start | turn/start | turnStarted |
| message_start(assistant) | assistant/stream{type:start} | messageStarted |
| message_update text_delta | assistant/stream{type:text} | textDelta |
| message_update thinking_delta | assistant/stream{type:thinking} | thinkingDelta |
| message_update toolcall_end | tool_use_start+tool_use_input+tool_use_end 三连 | toolCallAdded（args 增量拼接） |
| message_end | assistant/stream{type:usage\|done} | messageFinal（权威快照 = done.usage + tool/result 合成） |
| tool_execution_update/end | tool/progress、tool/result | toolUpdated/toolEnded |
| agent_settled | settled{sendId,ok} | turnSettled（+ok/reason 透传） |
| queue_update | inbox/spliced + get_state.queue | queueChanged（spliced 触发拉取） |
| compaction_start/end 对 | compaction 单事件 | compacting=false + 压缩完成通知 |
| auto_retry_start | llm/retry | retrying |
| session_info_changed | （无事件；set_session_name 本地回声） | sessionRenamed 由 app 自发 |
| bash_execution_update | bash_execution_update{id,delta,truncated} | bashOutput |
| subagent_event 帧 | event 帧 + agentName | subagentStarted/Delta/Tool/Settled（分流键 = agentName） |
| subagent_message 帧 | agents/terminal + 带 agentName 流 + get_subagents(work) | subagentText 语义合成 |
| heartbeat.subagents | 摘除 | 在途徽标 = agents/state 事件 |
| （新）agents/permission-ask | 同名事件 | agent 面板信息展示（无应答面，§1.2） |
| （新）hook/error、request/start、plugin/*、step/* | 同名 | 忽略（D14） |

### 5.3 测试迁移矩阵（存量 → 动作）

| 存量测试 | 动作 |
| --- | --- |
| contracts 词表/封闭断言 4 件 | 重写（新词表基准 = COMMAND_NAMES/frames.ts） |
| adapter 6 件 | 夹具换内核词表重写；subagent-spawns 用例并入 event-mapper |
| infra host-process 21 件 | 微修（fake-host 帧字段/直执行用例新增） |
| main 33 件 | 按行为变化重写；fork/setThinking/permission/skills/agents 用例换新语义 |
| renderer 相关（fold-events/fold-subagents/entry-hydration/权限/思考/队列/notify 对话框） | 夹具重写；notify 对话框用例删除（D10 裁决） |
| runtime.integration.test.ts（GLM opt-in） | 重写为 faux 默认门全接口旅程；GLM 真门保留 opt-in |
| testkit mock-client/replay | 不涉协议，保留 |

### 5.4 回滚方案

- 分支隔离（t38-host-hub）；合入前 main 零影响。
- 切换点单点化：hub-paths + sync-resources 两处；回滚 = 切回 main。
- 数据面：app 自有（registry.sqlite/设置/密钥库）不受影响；`<agentDir>` 下 pai 产物被新写入者整文件覆盖，无 schema 迁移动作。

## 6. 验收清单（全部满足才算完成）

- [ ] 四门全绿（lint 0-0 / typecheck / build / test + 覆盖率 ≥90/85 只升不降），数字如实报告
- [ ] 词表对拍：app 镜像命令集/帧集 = host-hub `COMMAND_NAMES`/`frames.ts` **代码**逐项一致（人工核对记录在案）
- [ ] W6 集成默认门全绿：全部 app API 面经真 hub 驱动成功；落存储断言逐项过（transcript/registry/models.json/hub-settings/agents 目录）
- [ ] 优雅停机（stdin EOF → hub exit 0）与挂死重启对账（杀 host → 重启 → registry 逐个 resume）旅程过
- [ ] 打包形态：sync-resources 编译产物直执行冒烟过
- [ ] 对抗审查（方案定稿前已过一轮 + 实施后 diff 一轮）偏差清单清零
- [ ] 假绿对抗抽查（skip/only grep 零命中、阈值未动、断言强度抽查）
- [ ] 删除域全部有 §2/§4.1 裁决出处；pai 协议字面量 grep 清零（PI_CODING_AGENT_DIR/PAI_IDLE_RETIRE_MS/pai-cli/message_start/agent_settled/queue_update/subagent_event/subagent_message/navigate_tree/get_sandbox_state/get_thinking_levels/get_permission_rules/entryId/mimeType——按 §4.1 口径允许「历史任务文档 tasks/*.md 与 CHANGELOG 例外」）
- [ ] 文档状态推进「已核销」

## 7. 挂账（显式）

| 项 | 理由 | 后果 |
| --- | --- | --- |
| 旧 pai 会话不可恢复（D11） | 格式不兼容，转换器语义有损 | 升级后会话列表从新存储开始 |
| thinkingFormat 兼容退役（D2） | host-hub provider 面无此参数 | qwen/zai 思考参数形态渠道按默认形态发送 |
| notify/setStatus 对话框退役（D10） | host-hub 未实现 | app 通知条失去 dialog 来源（系统通知保留） |
| GLM 预设裸 id 接入限制 | host-hub llm-e2e 实测 | 真模型接入一律走 app custom 条目（现状已是） |
| bash 定向中止（D13） | id=关联 id 机制 app 不可达 | 仅全量中止；定向中止待 host-hub 协议演进 |
| agents/permission-ask 无应答面 | host-hub 协议无应答命令 | 子代理权限请求超时自动拒绝，app 仅展示 |

## 8. 对抗审查处置记录（2026-09-17，独立子代理审查）

- **H1**（W1 允许存量红违反四门纪律）→ 采纳：§4.2 重写为「无任何豁免 + 波内成对改写 + 细分提交粒度」。
- **H2**（models.json provider 语义/撞预设键静默剔除/api 词表未定义）→ 采纳：§1.1 补 models.json 形状与撞名规则；D2 补三道写前校验（预设键运行期派生）；L1 一并处置（modelOverrides 不写）。
- **H3**（/compact 拦截路径响应阻塞且无 settled）→ 采纳并实测复核：D7 增特例（本地预判词形、响应即终态、长超时）；受理窗口竞态（M4）同条处置（恰一次自动重试）。
- **M1**（裁决表漏 15+ 文件）→ 采纳：§4.1 补全（api/runtime/inflight-views/ports/settings/agents/response-views/subagent-spawns/content/agent-dir-files/paths/index/electron-builder/fork 族/fold-hydrate/hydrate-items/strings）+ 口径声明（差异表驱动 + import 依赖图跟随 + grep 清零为完备性门）。
- **M2**（abort_bash 定向不可达）→ 采纳：D13 全量语义，挂账。
- **M3**（project 直写缺同规校验）→ 采纳：D6 补校验清单。
- **M4**（受理窗口竞态）→ 并入 H3/D7。
- **M5**（set_model 下轮生效漏列）→ 采纳：§1.1/§5.1 增行。
- **M6**（事件词表不完整/permission-ask 未裁决）→ 采纳：§1.2 补全 + D14 忽略策略 + permission-ask 裁决展示。
- **M7**（HOME 并行隔离）→ 采纳：D12 注明（bun test 每文件独立进程 + HOME 敏感断言集中专属文件）。
- **L1-L7** → 全部采纳：L1 入 H2；L2 入 D1；L3 入 §1.1/D4；L4 入 §0（真相源=代码）+ §6（对拍对象=代码）；L5 入 D1；L6 入 §1.1/§3；L7 入 D4。
