# T39 — my-agent host-hub → x-harness host-hub 后端切换

> 状态：定稿（方案轮对抗审查两路 6H/13M/15L 合并去重逐条处置，见 §8）
> 状态流转：草稿 → 定稿（对抗审查清零）→ 实施中 → 已核销（验收清单全勾）
> 迁移源：后端进程 `/Users/wrr/work/my-agent/packages/host-hub`（T38 产物，55 命令）→ `/Users/wrr/work/x-harness/apps/host-hub`（下称 x-harness hub，56 命令）
> 本文档为三件套合一：§1-3 = DESIGN（契约基线），§4 = IMPLEMENTATION（裁决表与实施顺序），§5-7 = MIGRATION（对照、矩阵、回滚），§8-9 = 审查与实施记录。

## 0. 定位

把 Pai 的唯一后端进程从 my-agent host-hub 换成 x-harness hub：**全量替换，零兼容层**。两仓 host-hub 同源分叉各自演化——x-harness 侧 = my-agent 直系延续 + BATCH2/BATCH3（prompt images 能力门、toolOutputs 实时尾部、agent/spawned|finished 生命周期、thread/delete、/compact 内核命令注册面、get_commands 统一目录）。**协议代差集中在：事件面（全换代）、工具名面（整体换代）、响应形状（局部换代）**；帧集/命令族/进程契约高度同形。

**规格真相源 = x-harness hub 代码**（`apps/host-hub/src/protocol/` + 各 handler 实现 + `docs/MIGRATION.md` §4 客户端对照表——代码优先）。双侧事实已逐文件审计（2026-09-21，§1/§5 结论带 file:line 依据）。

**外部事实（待 W0 实测项标注 ⚠）**：

- x-harness 源码形态入口 `apps/host-hub/src/host/cli.ts`（bun 原生 TS；模块解析走 x-harness/node_modules——跨仓 cwd 无碍，与 T38 D1 同法）。
- ⚠ 编译形态（`bun build --compile`）worker `/$bunfs/` 自 spawn 未实测（my-agent 同链路 T38 已验，x-harness worker-process.ts:32-38 有同款自解分支）——W0 冒烟。
- 两侧 bun 同版本 1.4.2（app `resources/bun/bun` = x-harness 开发 bun，已核）。
- script 目录快照事实（代码级已核，W0 复验运行时行为）：provider `script`、模型 `script-1`、contextWindow 200_000、**无 maxTokens**（输出上限走 `DEFAULT_MAX_TOKENS` 回落）、reasoning + input [text,image]；**script adapter 是 worker 进程单例，主/子共享同一剧本游标**（W6 子代理旅程按共享序列编排）。

## 1. DESIGN — 外部契约基线（差异面全列；未列 = 与 T38 §1 基线同形）

### 1.1 命令面（56 = 55 + `thread/delete`）

- 帧基契约不变：JSONL stdio、`type`+`id`、response 恰一、心跳 1Hz、stdin EOF 优雅停机、行限 client→host 16MiB。
- `thread/delete` `{sessionPath}`（host 本地）：围栏词法同 resume（id 词法 `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`）；活族（live/spawning/retiring）拒 `already open`；`session is locked by another process`；`cannot delete subagent session`；血缘级联 BFS；trash 原子 rename；幂等。成功响应 data 为空——**级联结果 `removed[]` 在 host 层被丢弃（W0 D10.3 一并补 `data:{removed}`）**，W6 级联断言以此为准。
- `thread/start`：`{cwd?, modelId?, trusted?, permissionMode?, thinkingLevel?}`——trusted 语义同；permissionMode 词表 `plan|auto|full`（词表外静默降级不落盘）；thinkingLevel 词表 `off|low|medium|high|max`（词表外静默降级；词表内但模型不支持 → 显式 failure `thinkingLevel rejected: <unsupported>`）。裸 modelId 消歧 = 目录首命中且预设插入序在前（custom 与预设同模型 id 静默拨预设——app 渠道 id 避免与预设模型 id 同名，校验③同源防）；`provider?` 入参字段在装配面无消费路径（W0 对拍确认是否死字段）。
- `prompt/steer/follow_up`：受理即空 data 应答 + `settled{sendId,ok,reason?}` 终态（线程级关联口径不变）；受理窗口判定与 `streamingBehavior required while streaming` 文案同；images 校验**加严**（量限 8 张/单图 5MiB base64 字符/总 12MiB base64 字符 + **能力门硬拒** `invalid images: model does not accept images`——my-agent 期为剥图降级，D15）。/compact 拦截换代：行首词形命中内核命令注册表（词法 = trim 后行首 `/` + 小写 `[a-z][a-z0-9_-]*` + `$|\s` 前瞻；`//` 前缀不命中）→ 响应在压缩完成后回、data = `{summary, replacedCount, summaryTokens}`、无 settled；携图命中命令拒 `invalid images: compact does not accept images`；未注册词形交模型。compact 错误词表：`thread is streaming` / `Compaction already in progress` / `context too small to compact` / `compaction summarizer not configured` / `compaction aborted` / `compaction failed: <reason>`。分路序：命令分路先于流式判定。**独立 `compact` 命令（`{threadId, customInstructions?}`）与 prompt 拦截同执行路径（薄壳）——app 消费策略见 D7**。
- `get_state`：**model 复合形 `{provider, model}`（字段名 model，非 modelId）**；isCompacting = 主会话 command/run|done 计数 >0——**边界注**：当前唯一内核命令是 compact 故语义等价，x-harness 未来注册新命令即可能假阳性（消费面容忍）；余同形。
- `get_inflight`：同形 `{turnStartSeq, turnStartedAt, message, toolOutputs, bash}`；toolOutputs 元素同形，执行中有实时尾部内容（渲染消费挂账）。
- `get_subagents`：**形状换代** `{subagents: ChildView}`——判别联合：`{kind:"subagent", agentId, sessionId, type, depth, status: running|idle|stopped, work?}`（**work 由 W0 D10.2 补**）与 `{kind:"local-session", name, ref, status}`（hub 内部署不出现，镜像按判别联合建模）；`type` ≈ 源 agentName/agentType；runId/createdAt/lastActiveAt 无（渲染层未消费，镜像删除）。
- `get_commands`：source 词表**收缩 `command|skill`**。
- `get_entries`：entries 元素 `{seq, ts, event:{type, …data, surfaceOp?}}`；**seq 0 基**（my-agent 1 基——app 的 seq 全程取自 get_entries 回读再回传，基数自洽无硬编码，仅 fork 边界测试按 0 基断言）；事件种集 = 内核 SessionEventData 全集（§1.2）；游标语义与错误文案同。
- `get_models`：条目 `{id, provider, contextWindow?, maxTokens?, cost?, source}`——reasoning/input wire 面丢失（W0 D10.1 补 `reasoning?`/`input?`）；degraded → 先发 `hub_error "providers.json unreadable; preset-only catalog"` 再 success 预设集；**撞名语义 = custom 整档覆盖预设**（覆盖发生后该档案条目 source 变 "custom"——app 拒名策略前提下不会发生，见 D2 前提）。
- `thread/list_saved`：**入参收窄 `{cwd?}`**；响应 `{sessions: [{id, createdAt, updatedAt, title, model?, cwd?, forkParent?, messageCount, lastSeq}]}`——+createdAt/updatedAt，**-forkSeq/-depth/-archived**，无 sessionPath。
- `thread/list` / `get_host_info` / `get_fork_messages`（image → `[image: <mediaType>]`）/ `get_pending_dialogs` / `get_messages`（>100MiB 软上限拒）/ `set_session_name`（WAL session/meta）/ `bash`（id=请求 id、准入 confirm 弹窗、64KiB 内联/>1MiB 溢写）/ `abort_bash`（带 id 落穿 = 中止全部——**两侧同形非差异**）/ `clear_queue`（data=清空前队列，两侧同）/ `set_model`（含思考档不兼容拒文案，两侧同形）：同形。
- `fork`/`clone`：同形；seq 基数差见 get_entries 行。
- `set_thinking_level`：词表 `off|low|medium|high|max`（在飞拒/能力拒）。`get_thinking_level`：`{level, source: session|project|user|off}`——无值态归一 `off`（源 `unset`）。
- `permission/set_mode|get_mode`：**词表 `plan|auto|full`**；set 无 threadId = 全局默认（app 不消费）；get 无 threadId 的 source 恒 "default"（勿据此判来源）。
- `subagent/steer`：同形；**语义 = 驻留即投递**（running 排步边界/idle 唤醒）；非驻留 `subagent <agentId> not available (status: unknown)`。
- `settings/get|set`：键白名单不变，值域随词表变；项目级 `<cwd>/.x-harness/hub-settings.json`。
- `agents/create|remove|list`：create 入参族换代（name 非空无 `/` 无换行——无 kebab/保留名/≤500；description 非空单行非 `[a-zA-Z-]+:` 形态行；systemPrompt 非空；model 单行；tools 非空串数组）；写 `~/.x-harness/agents/<name>.md`；frontmatter `name`/`description`/`model?`/`tools?`（逗号分隔）+ body；round-trip 复析保证；**agents/list 只收 threadId（project 层仅 trusted 表内线程并入）——project 级枚举/撞名查不可走 agents/list（D6）**。
- `skills/list|set_enabled|remove`：`~/.x-harness/skills` + `<cwd>/.x-harness/skills`；list `{skills: [{name, source: user|project, path, disabled}]}`；set_enabled 可回 `{stillDisabled:true, by:"user"}`。
- `models/add|remove`：providers.json 域（protocol 词表 `anthropic|openai`）——app 不消费（D2），仅镜像。`auth/*`：list 全目录三态——app 不消费，仅镜像。
- `workspace/trust` / `set_idle_retire_ms{value}` / `set_rss_retire_bytes{value}`：同形。
- 通用错误面：`parse failure` / `unknown command` / `Unknown threadId` / `invalid id: reserved namespace`（id 不得 `@hub-internal:` 前缀）/ `too many in-flight commands` / `worker died before responding` / `shutting down`。

### 1.2 事件词表（全换代——最大差异面）

event 帧 `{type:"event", threadId, name, payload, agentName?}` 不变。**归属判定规则（实施级硬约束）**：

- **session 域（WAL 镜像）帧对所有会话外发**（含子会话）——帧 threadId 恒为主线程 id，payload 带 `session`（=所属会话 id），子归属帧另带帧级 `agentName`（=agentId，桥由 agent/spawned 播种）。**主时间线折叠谓词 = `payload.session === threadId`（等价 agentName 缺席）；子会话 session 域帧不进主时间线**（D3）。
- `agent/spawned|agent/finished` 载荷键为 `agentId`，**帧自身不带 agentName**（播种源）；面板分流键 = 载荷 agentId。
- session 域 payload 壳 = `{seq, time, …data, session}`。

**app 消费子集**（→ UiEvent 映射全表见 §5.2）：

- session 域（**主会话谓词过滤后消费**）：`turn/start`、`turn/end {reason: {kind: completed|aborted|blocked|error|max-tokens|interrupted, …}}`、`step/start|end`、`user/message {content}`（image → ContentBlock）、`assistant/message {content, thinking?, usage?, stopReason?}`（权威终局）、`tool/call {callId, name, arguments}`、`tool/result {callId, content, isError?}`、`llm/retry {retry, delayMs, failure:{message, code?}}`、`agent/inbox/spliced`（载荷 `insert{target,entries}|claim{target,turn,claimed}|clear{reason}` 判别联合——触发拉 get_state 口径不变）。
- 实时域：`llm/chunk {turn, step, chunk}`——仅主会话外发（chunk = LlmChunk 判别 `text-delta|thinking-delta|tool-call-delta|usage|finish`；finish.kind = `stop|max-tokens|error`；**无 per-message start 帧——messageStarted 边界 = (turn, step) 对变化时重置流缓冲**，见 §5.2）；`agent/assistant-stream {session, turn, step, frame:{phase, kind, text}}`（子代理增量，帧带 agentName）；`agent/tool-stream {session, callId, delta}`（带 agentName 帧 + 主会话帧——主会话按 session 谓词分流）；`agent/status {session, status}`；`agent/spawned {parent, agentId, sessionId, type, depth, work?}`（W0 补 work）；`agent/finished {parent, agentId, sessionId, outcome: completed|stopped|failed, detail, summary?}`（每运行周期恰一次）；`compaction/landed {trigger, replacedNodes, summaryTokens}`；`permission/decided {tool, verdict, resolvedBy, reason, session?}`（**裁决后审计帧——非 ask 进行态信号**）。
- worker 合成域：`settled {sendId, ok, reason?}`（排序承诺：最后一个 turn/end 后；worker 死亡 host 合成 `ok:false, reason:"worker-died"`）；`bash_execution_update {id, delta, truncated?}` 同形。
- 退役：`assistant/stream` 全系、`tool/start|result|progress`、`inbox/spliced{queue,op,ids}`、`compaction{generation,…}`、`llm/retry` 旧载荷、`permission/decision`、`agents/spawned|state|terminal|evicted|user-injected|idle|permission-ask` 七事件（等价物 = agent/spawned + agent/status + agent/finished + get_subagents 水化）。
- 忽略（显式认领，前向兼容）：`request/header|context`（源 request/start 等价物）、`system/message`、`assistant/attempt`、`session/end-seed`、`session/meta`、`todo/snapshot`、`command/run|done`、`autocompact/*`、`compaction/served-window|diagnostic`、`agent/error`（终态经 settled/turn/end 收敛）、`hook/error`（x-harness 已无此面）、`plugin/*`（x-harness 已无此域）、`step/start|end`（无细粒度消费需求）。

### 1.3 环境与进程契约

- 帧集 7 类不变；`hub_error {message, threadId?}` / `heartbeat {rssBytes, cpuPercent}` / `thread_parked.reason = idle|manual|rss` / `thread_died.reason` 同。`ui_request` 载荷 RESERVED 键过滤（hub 侧防线，app 无感）；method 仅 `confirm`；载荷平铺：permission ask `{tool, reason}`（**无 summary——且无子代理归属字段，见挂账**）与 bash 准入 `{tool:"bash", summary, reason}`；超时 5min 默认拒绝。
- 环境面：`HUB_AGENT_DIR`（缺省 `~/.x-harness/hub`——app 显式注入）/`HUB_SESSIONS_ROOT`/旋钮族同名同缺省 + 新增 `HUB_BASH`（app 不设）。**测试注入：`HUB_WORKER_PROVIDER=script` + `HUB_WORKER_SCRIPT=<JSON>`**——剧本 `ScriptStep[]` 判别联合：`{reply, thinking?}` / `{toolCalls:[{name, input}]}` / `{error:{code, message?, retryable?}}` / `{delayMs}`；**worker 单例共享游标**（主/子同剧本顺序消费——W6 编排约束）。
- 磁盘布局三变（D5）：sessions `<id>/events.jsonl` + `<id>/header.json`（**id 围栏词法 `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`——app 侧镜像全词法**）；模型目录 `providers.json`（D2）；agents/skills/项目级设置 `.x-harness` 域。credentials.json / trusted-workspaces.json / bash-outputs / trash 同。

## 2. DESIGN — 方向性裁决（方案轮审查后定稿）

- **【D1】集成路径切换**：hub-paths dev 探测改 `../x-harness/apps/host-hub`（`src/host/cli.ts` > `dist/host/cli.js`）；sync-resources 编译源 = `<repoRoot>/../x-harness/apps/host-hub/src/host/cli.ts`（`PAI_HUB_ENTRY` 覆写不变）；spawn 直执行形态与 `resources/bun/bun` 保留。**存量集成测试（host-hub.integration.test.ts）的入口/env/装置换代整体归 W6**——该测试自带 hubPaths 注入，不随 hub-paths 联动；W1-W5 过渡期默认集成门继续跑 my-agent 形态（装置仍指向旧仓），W6 一次性换代并移除（过渡态如实声明，非兼容层——旧装置在 W6 被删）。
- **【D2】providers.json 重写（app 仍是唯一目录写者）**：`writeModelsConfig` 重写为 x-harness catalog 形状 `{providers: [{name, protocol, baseUrl, apiKeyEnv: PAI_KEY_<NAME>, models: [{id, contextWindow?, maxTokens?, reasoning, input, cost?}], contextWindow?, maxOutputTokens?}]}`（不写 default/apiKey 字面量）。**模型级 `reasoning`/`input` 显式写布尔/数组（omit-when-false 惯例退役**——x-harness 缺省 reasoning=true、缺 input 拒图，省略即语义翻转）；baseUrl 写前形状校验（`http(s)://` 前缀，缺 scheme 整档案被剔且零告警）。app 内部 api 词表 `anthropic-messages|openai-completions` → `anthropic|openai`：ProviderConfig.api 直接换 + 存量 settings.json 读盘一次性归一迁移（写侧只产新词表）。三道写前校验保留 + baseUrl 形状（第④道）；预设键撞名拒——**前提显式**：app 是唯一写者 + 校验先于落盘 ⇒ 运行期 `source:"preset"` 派生集合永不被 app 自身写遮蔽（手改 providers.json 不属 app 契约；覆盖语义下被遮蔽预设 source 变 "custom" 是派生漏出的根因，前提成立则不可达）。
- **【D3】事件面换代（UiEvent 语义面稳定 + 主会话谓词）**：渲染层 UiEvent 词表不动；adapter event-mapper 全表重写（§5.2，每行带主会话谓词）；**子会话 session 域帧（payload.session ≠ threadId）不进主时间线**——子代理面板消费实时域（agent/assistant-stream|tool-stream|spawned|finished|status，agentName/agentId 分流），其余子会话帧忽略。entries-mapper 按 SessionEventData 全集重写（HistoryItem 形状不变，水化天然只有主会话）。
- **【D4】词表三跟随**：权限 4 档 → `plan|auto|full`（菜单 3 档，文案进 strings）；思考 4 档 → `off|low|medium|high|max`（菜单 5 档；unset 退役——无值态 = off/source off）；api 词表（D2）。用户可见变化如实进 strings，不做映射伪装。
- **【D5】布局三变 + 旧会话不迁移**：sessionPath 词法 `transcript.jsonl` → `events.jsonl`（三处：response-views 重建、isHubSessionLayout + **id 词法镜像全词法**、resume/register 白名单）；models.json → providers.json（app 每次 spawn 重写；**孤儿 models.json 启动清扫删除**）；`.my-agent` → `.x-harness` 域。旧 my-agent 会话（transcript 布局）围栏词法拦 → 对账按非 hub 布局删行（现有路径自动覆盖）。挂账见 §7。
- **【D6】agents 面：user 级命令面、project 级本地扫描**：user 级 CRUD 走 `agents/create|remove`（hub round-trip 保证；HOME 重定向链路闭环——hub 子进程 homedir() 现算已核）；**project 级枚举与撞名查保留 store 本地目录扫描**（agents/list 的 project 层只在 trusted 表内线程时并入，未开线程/未信任时不可见——不能作 project 前置查）；project 直写 `<cwd>/.x-harness/agents/<name>.md` 镜像 renderAgentType 同构（name 入档、tools 逗号分隔、null 不写）+ 写前同规校验镜像。app 侧 kebab/保留名/≤500 校验退役。
- **【D7】/compact：app 词形命中后直发 `compact` 命令**：app 本地 `/compact` 词形命中（compact-lexing 镜像保留，仅作 UX 路由）→ 直接发 `compact {threadId, customInstructions: 行余部 trim}`（与 hub prompt 拦截同执行路径、同词表、同 data 三元组）——**消除 app 对 hub 拦截面行为对齐的依赖**（镜像漂移后果降级为「一条 /compact 形消息交模型」而非超时/终态错配）；30min 长超时与受理重试豁免逻辑迁移到 compact 命令路由；流式中收 `thread is streaming` toast 透传。
- **【D8】settled/受理重试/收养链保留**：线程级 settled 关联保留；恰一次 followUp 重试保留；resume `already open` 收养链保留；删行正则族已覆盖 x-harness 文案（`symlink escape` 实为 `session path outside sessions dir: symlink escape`，被 `outside sessions dir` 子串覆盖——已复核关闭）。
- **【D9】thread/delete 接入**：镜像入 56 词表；api.ts 增 `session/delete {sessionPath}`（白名单同 resume；活族先拒提示）；渲染层入口挂账。
- **【D10】x-harness 侧缺口修复（W0，在 x-harness 仓库按其 AGENTS.md 规约实施——方案/代码收口各 ≥2 独立审查者）**：
  1. **get_models 能力位**：models-auth 条目补 `reasoning?: boolean`、`input?: ("text"|"image")[]`（CatalogEntry 已有，wire 映射丢弃）；
  2. **delegation work 链**：**持久化载体定为会话 `header.json` agent 块**（既有 agentId/agentType/agentDepth/agentWorktree 同构）增 `work` 字段——**work = spawn 入参 `description`（3-5 词任务摘要，语义即面板 task，无需截断规则）**；改动点五处：ChildRow（spawn 捕获）、emitSpawned 签名（spawn/revive 两发射点——revive 按 header 回填）、ChildView、AgentSpawnedPayload（tokens）、get_subagents 视图。验收 = app 子代理面板 task 文本零降级；
  3. **thread/delete 响应补 `data:{removed: string[]}`**（host 层丢弃级联结果——x-harness 自身信息丢失规约）。
  各自带回归用例，x-harness 四门（2257 基线只升不降）。
- **【D11】测试注入换代**：集成装置 faux → script（env 键 + 剧本判别语义 + 共享游标编排约束）；setThinking 预算用例按 script-1 实测参数（200k ctx/无 maxTokens/DEFAULT_MAX_TOKENS 回落）适配；GLM opt-in 真门保留（providers.json custom 渠道）。
- **【D12】monitor/心跳/停机链不变**：W1 冒烟复验覆盖。
- **【D13】未知事件/命令忽略**：前向兼容保留；app request 层 id 生成器加 `@hub-internal:` 前缀排除断言。
- **【D14】工具名面换代（渲染数据源级）**：app 适配 x-harness 工具名族——子代理 spawn 解析 `'agent'` → `'agent_spawn'`（schema `{description, prompt, subagent_type?, model?, isolation?}`——**description 即 work 源**）；文件变更视图 `'edit_file'|'write_file'` → `'write'`（args `{path, content}` 同形，edit 分支删除——x-harness tool-write 无 edit 工具）；`run_command` → `bash`；`agent_output|agent_stop` → `task_output|task_stop`。涉及 subagent-spawns.ts / diff-extract.ts / entries-mapper.ts / args-preview.ts。
- **【D15】images 硬拒的 UI 面**：能力门从剥图降级变硬拒——渲染层附件门禁提示（非携图模型上传附件 → 预警文案进 strings；发送被拒时 toast 透传 hub 文案）；量限文案进 strings。

## 3. DESIGN — 不处理清单（归属显式）

| 不处理 | 归属 |
| --- | --- |
| 旧 my-agent 会话格式转换 | D5 挂账（事件集分叉，转换有损） |
| models/add\|remove / auth/* 消费 | D2：app 是目录/凭据唯一写者 |
| providers.json default 档 / apiKey 字面量 | D2：显式寻址 + env 引用链 |
| permission/set_mode 无 threadId 全局形态 | §1.1：settings/set 承担 |
| todo/snapshot、command/run\|done、autocompact/* UI | 前向兼容忽略；后续任务按需 |
| toolOutputs 实时尾部渲染 | 契约就绪，消费挂账（§7） |
| thread/delete 渲染层入口 | D9：本任务协议+主进程面 |
| 子代理权限 ask 进行态归属展示 | §1.2：ui_request 无归属字段、decided 为事后帧——挂账（§7） |
| x-harness 内核行为（WAL/压缩/delegation 语义） | x-harness 仓库职责 |
| provider? 死字段对拍、script 剧本运行时行为 | W0 摸底清单 |

## 4. IMPLEMENTATION — 裁决表与实施顺序

**口径（恢复 T38 完备性门）**：下表列**协议直接依赖点**；表外文件按「§1/§5 差异表驱动 + import 依赖图跟随改写 + **旧词表 grep 清零为完备性门**」——grep 清零清单：旧 api 词表（`anthropic-messages`/`openai-completions`/`openai-responses`）、`inbox/spliced`（非 agent/ 前缀）、`agents/state|terminal|evicted|idle|permission-ask`、`assistant/stream`、`tool/start|result|progress`、`transcript.jsonl`、`models.json`（写侧）、`.my-agent`、旧权限档（`acceptEdits`/`fullAuto`）、`unset` 思考态、`'agent'`/`'edit_file'`/`'write_file'`/`'run_command'`/`'agent_output'`/`'agent_stop'` 工具名（协议消费点）。typecheck + grep 双清零才算波完成。

### 4.1 文件级裁决（app 侧）

**重写**：

| 文件 | 裁决理由 |
| --- | --- |
| `contracts/src/hub-events.ts` | 事件词表换代（消费子集 + LlmChunk 判别 + session 壳 + 主会话谓词类型） |
| `contracts/src/hub-data.ts` | StateData.model、SubagentsData 判别联合+work、SessionSummary ±字段、CommandEntry、ThinkingLevelData、SessionStatsData（cost 入 tokens）、compact 三元组、delete |
| `contracts/src/hub-commands.ts` | 56 词表 + agents 入参族 + list_saved 收窄 + thinking/permission 词表 + compact 入参 |
| `contracts/src/permissions.ts` / `thinking-levels.ts` / `settings.ts`(api) | 词表三变 |
| `contracts/src/inflight-views.ts` | SubagentView 换代（agentId 键 + type + work） |
| `adapter/src/event-mapper.ts` | 全表重写（§5.2 含谓词与步边界状态机） |
| `adapter/src/entries-mapper.ts` | SessionEventData 全集 + 工具名换代（D14） |
| `adapter/src/subagent-spawns.ts` | `agent` → `agent_spawn`（schema + description→work） |
| `adapter/src/diff-extract.ts` | `edit_file\|write_file` → `write` |
| `adapter/src/command-encoder.ts` | list_saved 收窄、agents 族、compact 直发、thread/delete、词表 |
| `adapter/src/response-views.ts` | 新响应形状 + events.jsonl 重建 + stats cost |
| `main/models-config.ts` | providers.json + 显式 reasoning/input + baseUrl 校验 + api 归一 |
| `main/api-routes-settings.ts` | 词表 + skills 收窄（source user\|project）+ baseUrl 形状 |
| `main/agent-definitions-store.ts` | user 级命令面 + project 本地扫描留任 |
| `main/agent-definition-file.ts` | serializeAgentDefinition 镜像 renderAgentType（name 入档/逗号 tools） |
| 渲染层 `live/fold-events.ts`、`fold-subagents.ts` | 新词表折叠 + agentId 键 + 主会话谓词 |

**微修**：

| 文件 | 变更 |
| --- | --- |
| `main/hub-paths.ts` | dev 探测 x-harness |
| `main/pai-runtime.ts` | **dispatchFrame `inbox/spliced` → `agent/inbox/spliced`**；isHubSessionLayout（events.jsonl + id 全词法）；`main/provider-probe.ts` 传输表键换新 api 词表 |
| `main/api-routes.ts` | compact 直发路由（D7）+ session/delete + stats cost 消费点 |
| `main/index.ts` | 孤儿 models.json 清扫 |
| `scripts/packaging/sync-resources.ts` | 编译源 x-harness |
| `adapter/src/dialog-mapper.ts` | summary 缺席容忍（现状已容忍——仅测试面锚定） |
| 渲染层组件（权限菜单 3 档/思考菜单 5 档/agent 面板/附件门禁/strings） | D4/D15 |
| `infra/__test__/fake-host.ts` | 仅词汇耦合处对齐 |

**删除**：unset 思考态/4 档权限/plugin·builtin source/`agent-definitions-store` user 级文件面 CRUD/diff-extract edit 分支/旧 api 词表枚举。

### 4.2 实施顺序

**波次结构（W0 实施后修订）**：W2-W6 = **单原子实施序列**（T38 bb39fb8 同模式）——集成门是全协议面的活体断言，任何词表/事件/形状变化都打断 my-agent 过渡形态（permission 词表换 → my-agent 拒；providers.json 换 → my-agent 不读），域切片波不可行。序列内顺序：contracts → adapter → main → renderer → 集成门换代，**一个提交**交付（四门全绿后）；W6 的旅程扩面并入该提交的集成门重写。

1. **W0（x-harness 仓库，已完成 41199f2）**：D10 三缺口 + 编译形态冒烟 + 摸底（provider? 死字段确认、script 参数、共享游标实证）。
2. **W1（app，已提交 9c67649）**：hub-paths/sync-resources 集成点切换 + 源码/编译双形态探针冒烟（此波不动协议——存量集成门最后一次跑 my-agent 形态）。
3. **W2-W6（app，单原子提交）**：contracts 镜像换代（词表三变/56 词表/事件词表/响应形状）→ adapter 族重写（事件映射谓词与步边界/工具名/entries 全表）→ 主进程（providers.json + api 归一迁移/agents 面/对账布局/delete 路由/compact 直发/孤儿清扫）→ 渲染层（折叠器/菜单/面板/附件门禁/strings）→ 集成门整体换代（x-harness 入口 + script provider + 全接口旅程 + 落存储断言）。序列内旧词表 grep 清零。
4. **W7**：收口（实施轮对抗审查 + 假绿抽查 + grep 清零终检 + 数字如实 + 状态推进）。

### 4.3 测试计划

- 词表封闭三断言：命令 56、帧 7、事件消费子集（对拍基准 = x-harness 代码）；UiEvent 词表不变断言。
- event-mapper 表驱动：§5.2 逐行 + **主会话谓词负例（子会话帧不进主时间线）** + (turn,step) 步边界重置 + agentName 分流 + finish.kind 穷举。
- entries-mapper：SessionEventData 全种夹具（ContentBlock image、turn/end reason 判别穷举、工具名新族）。
- 行为回归：受理重试/收养/删行正则/compact 边界词形（`//compact`、`/COMPACT`、`/compactx`、`/compact keep goals`→customInstructions）/api 词表迁移 round-trip（旧值入→新值出→旧值不再产）/baseUrl 形状拒/reasoning·input 显式写/work 链（W0 侧）/delete removed 断言。
- 集成（W6）：全 API 面驱动 + 落存储（events.jsonl+header.json 含 agent work/providers.json/.x-harness 域/hub-settings/agents 目录）+ 生命周期（EOF/retire→parked→resume 收养/abort/compact 三元组/delete 级联）+ script 剧本四向量 + 子代理旅程（共享游标编排）。
- 覆盖率：两仓各自基线只升不降（app：现行阈值；x-harness：行/语句/函数 ≥90、分支 ≥85）。

## 5. MIGRATION — 对照与矩阵

### 5.1 命令差异表（变化项；未列 = 同形）

| 命令 | my-agent（T38 基线） | x-harness | app 动作 |
| --- | --- | --- | --- |
| thread/delete | 无 | 新增（data {removed} W0 补） | 镜像 + 路由（D9） |
| thread/start | 4 档/4 档静默 | 3 档/5 档；能力拒 | 词表 + toast |
| prompt /compact | 拦截 | 注册表分路 | **直发 compact（D7）** |
| get_state | modelId | model 复合 | 镜像 + 消费点 |
| get_subagents | 8 字段 | 判别联合 + work(W0) | 视图换代 |
| get_commands | plugin·builtin·skill | command·skill | 镜像 |
| get_entries | 1 基/15 种 | **0 基**/全集+surfaceOp | mapper 全表（基数自洽） |
| get_models | 无能力位 | 同左（W0 补） | 可选消费 |
| thread/list_saved | 全键+游标 | {cwd?}；±字段（-forkSeq/-depth/-archived） | 停发 + Summary |
| get_session_stats | cost 顶层恒在 | **cost 入 tokens 且可缺席** | 消费点迁移 |
| set/get_thinking_level | 4 档 + unset | 5 档 + off | 词表 + 菜单 |
| permission/set·get_mode | 4 档 | 3 档 | 词表 + 菜单 |
| subagent/steer | busy-only `not busy` | 驻留即投递 `not available (status:…)` | busy 门槛 UI 移除 |
| agents/create·remove·list | kebab/保留名/≤500；无 name 档 | 新校验族 + name 入档 | D6 |
| skills/list | source skill-* | user·project | 收窄适配 |
| models/add·remove·auth/* | models.json 域 | providers.json 域/三态 | 不消费（镜像换代） |
| 工具名（事件/水化载荷内） | agent/edit_file/write_file/run_command/agent_output/agent_stop | agent_spawn/write/bash/task_output/task_stop | **D14 全点适配** |

### 5.2 事件映射表（→ UiEvent；UiEvent 不动；**主会话谓词 = session===threadId 适用于全部 session 域行**）

| my-agent（现消费） | x-harness 来源 | UiEvent |
| --- | --- | --- |
| assistant/stream start | llm/chunk 首 delta，**(turn,step) 变化即重置流缓冲**（messageStarted 边界） | messageStarted |
| assistant/stream text/thinking | llm/chunk text-delta/thinking-delta | textDelta/thinkingDelta |
| assistant/stream tool_use_* | **WAL `tool/call`（主会话谓词内；参数集齐即现）**；tool-call-delta 仅作增量补充 | toolCallAdded |
| assistant/stream usage·done | **WAL `assistant/message`（权威终局）** | messageFinal |
| tool/start·progress·result | WAL tool/call + tool/result + agent/tool-stream（主会话帧） | toolUpdated/toolEnded |
| turn/start·end | 同名（壳 + reason 判别） | turnStarted/生命周期 |
| settled | 同名同形 | turnSettled |
| inbox/spliced{queue,op,ids} | **agent/inbox/spliced**{insert\|claim\|clear} | queueChanged（拉 get_state 不变） |
| compaction{generation,…} | compaction/landed | compacted + compacting=false |
| llm/retry | llm/retry{retry,delayMs,failure} | retrying |
| permission/decision | permission/decided | 权限通知 |
| agents/spawned·state·terminal | agent/spawned{+work} + agent/status + agent/finished | subagentStarted/Settled（键 agentId） |
| agents/idle·evicted·user-injected | agent/status + get_subagents 水化 | 面板状态 |
| agents/permission-ask | **无等价 ask 信号**（挂账 §7） | pendingAsk 退役（面板展示「权限请求无归属等待态」） |
| 子代理文本增量 | agent/assistant-stream（agentName 帧） | subagentText/Delta |
| （新）agent/tool-stream（agentName 帧） | 同名 | 子代理工具增量 |
| 子会话 session 域帧 | **过滤不进主时间线（D3）** | — |
| 其余新事件 | — | 忽略（§1.2 清单） |

### 5.3 测试迁移矩阵

| 存量测试 | 动作 |
| --- | --- |
| contracts 词表/封闭断言 | 重写（56/新事件子集/词表三变/UiEvent 不变断言） |
| adapter 件（mapper/spawns/diff/args-preview） | 夹具换 x-harness 词表 + 工具名族重写 |
| main 件（api-routes/models-config/agent-store/reconcile/adopt/compact-lexing/provider-probe） | 按行为变化重写；迁移 round-trip 新增 |
| renderer 折叠器/面板/菜单/strings 件 | 夹具与词表重写 |
| host-hub.integration.test.ts | W6 整体重写（script + x-harness 缺省）；GLM opt-in 保留 |
| infra host-process 件 | 基本保留；直执行用例期望随 hub-paths 改 |

### 5.4 回滚方案（如实）

- 分支隔离（t39-x-harness-hub）；切换点单点化：hub-paths + sync-resources；回滚 = 切回 main。
- **数据面（如实表述）**：settings/密钥库不受影响；models.json 可由渠道定义全量重建（写侧本就每次重写）；**registry 旧 my-agent 会话行在切换后首次对账时删除，回滚不恢复**（transcript 文件留存但引用丢失）；providers.json 为新文件，回滚后成孤儿（无害）。

## 6. 验收清单（全部满足才算完成）

- [ ] W0：x-harness 四门全绿（D10 三缺口 + 回归）+ **其规约两轮审查清零** + 编译形态冒烟过 + 摸底产出回写本档（provider? 死字段结论/script 运行时行为/共享游标实证）
- [ ] app 四门全绿 + 覆盖率只升不降（数字如实）
- [ ] 词表对拍：COMMAND_NAMES ↔ HUB_COMMAND_TYPES 56=56；帧 7；事件消费子集对拍 event-bridge 订阅清单；**旧词表 grep 清零**（§4 口径清单）
- [ ] W6 集成默认门全绿（全 API 面 + 落存储 + 生命周期 + compact 三元组 + delete 级联 removed + 子代理旅程 task 零降级）
- [ ] 对抗审查实施轮清零 + 假绿抽查（skip/only grep 零命中、断言强度、迁移矩阵外无删改）
- [ ] 文档状态推进「已核销」

## 7. 挂账（显式）

| 项 | 理由 | 后果 |
| --- | --- | --- |
| 旧 my-agent 会话不可恢复 | WAL 事件集分叉，转换有损 | 升级后会话列表从新存储开始 |
| thread/delete 渲染层入口 | 本任务协议+主进程面 | 删除暂无 UI 入口 |
| toolOutputs 实时尾部渲染 | 契约就绪未排期 | 执行中工具输出占位 |
| todo/snapshot·command/run·done·autocompact/* UI | 无对应面板 | 前向兼容忽略 |
| 子代理权限 ask 进行态归属 | ui_request 无归属字段、decided 为事后帧 | 面板无「等待确认」行（超时自动拒绝行为不变） |
| providers.json default 档 | 显式寻址够用 | 无 |

## 8. 对抗审查处置记录（方案轮，2026-09-21，两路独立审查）

审查 A（契约/语义对照面）2H/6M/8L；审查 B（自洽/可实施性面）4H/7M/7L。合并去重逐条处置：

- **A-H1 工具名面整体换代漏列** → 采纳：新增 D14 + §1.1 工具名行 + §4.1 四文件（subagent-spawns/diff-extract/entries-mapper/args-preview）+ grep 清零清单。
- **A-H2 子会话 WAL 帧无过滤规则** → 采纳：§1.2 归属判定规则 + D3 主会话谓词 + §5.2 全行谓词 + §4.3 负例用例。
- **B-H1 W1 波次自相矛盾（集成测试换代必归 W6）** → 采纳：D1/W1 重构 + 过渡态声明。
- **B-H2 按层切波必红** → 采纳：§4.2 域切片波 + 原子序列兜底声明。
- **B-H3 回滚「数据面不受影响」失实** → 采纳：§5.4 如实改写。
- **B-H4 完备性门口径丢失 + provider-probe.ts/pai-runtime inbox 硬编码两漏网文件** → 采纳：§4 口径段 + grep 清零清单 + §4.1 微修表补两行。
- **A-M1 messageStarted/final 步边界缺失** → 采纳：(turn,step) 变化重置流缓冲（§1.2/§5.2）；toolCallAdded 源改 WAL tool/call（采纳其建议——参数集齐即现，信息同源更稳）。
- **A-M2 pendingAsk 替代表述错位** → 采纳：如实标「ask 归属能力退役」挂账（§7）。
- **A-M3 stats cost 搬家非加字段** → 采纳：§5.1 明示字段迁移。
- **A-M4 thread/delete removed 被丢** → 采纳：并入 D10.3（W0 hub 侧补 data）。
- **A-M5 script-1 无 maxTokens** → 采纳：§0/§1.3 回写代码事实。
- **A-M6/B-M2 input/reasoning 省略即语义翻转 + baseUrl 形状** → 采纳：D2 显式写 + 第④道校验。
- **B-M1 撞名派生集合前提** → 采纳：D2 前提显式（三条件）。
- **B-M3 project 撞名查不可走 agents/list** → 采纳：D6 project 本地扫描。
- **B-M4 work 载体规格下放** → 采纳：定为 header agent 块 + work=description + 五改动点（D10.2）。
- **B-M5 images 硬拒 UI 无动作项** → 采纳：D15。
- **B-M6 script 共享游标编排约束** → 采纳：§0/§1.3 装置事实 + W6 编排约束。
- **B-M7 W0 未按 x-harness 审查规约** → 采纳：D10/W0 验收项补充。
- **B-L1 compact 直发裁决** → 采纳为 D7（直发命令，镜像仅作 UX 路由）。
- **B-L2 isCompacting 巧合等价** → 采纳：§1.1 边界注。
- **B-L4 set_model 新失败面** → 处置：审查 A 已核两侧同形（非差异），§1.1 归入同形行，无 app 动作。
- **B-L5 裸 modelId 消歧 + provider? 死字段** → 采纳：§1.1 注 + W0 对拍项。
- **A-L1 abort_bash 落穿非差异 / A-L2 fork seq 基数 / A-L3 -forkSeq / A-L4 忽略清单认领 / A-L5·B-L6 id 词法 / A-L6 dialog-mapper 可免 / A-L7 retryable / A-L8 ChildView 判别联合 / B-L3 子代理权限挂账 / B-L7 skills-section 文案** → 全部采纳：分别落 §5.1 差异表修正、§1.2 忽略清单、D5 全词法、§4.1（dialog-mapper 降为测试锚定）、§1.3、get_subagents 判别联合、§7 挂账、grep 清零口径。

## 9. 实施记录

### W0（已提交 x-harness 41199f2）

- D10 三缺口落地：get_models 能力位（modelShapeOf 单点构造收敛 get_models/set_model_override/models/add 三读口；reasoning 恒在场 + input 条件在场；models/add 入参 input 词表外拒）；delegation work 链（ChildRow/tokens 载荷/ChildView/list_agents 文本面；持久锚 header.agentWork，复活回填旧档案缺席安全）；thread/delete data:{removed}。
- 代码收口两路对抗审查（work 链正确性面 + 契约回归假绿面）：0H 共识问题全处置——models-admin 本地 modelShape 复制品删除（单点化）、models/add input 入口、文档八处同变（DESIGN×6/MIGRATION/AGENT-DELEGATION/SESSION）、旧档案 work 缺席负例、modelShapeOf 入参必选化、agentWorktree gate 负例、viewLines work、smoke 标题 55→56。假绿抽查：无 skip/无断言弱化（审查者独立复跑确认）。
- 四门全绿：lint 0-0（569 文件）/ typecheck 0 / build ✓ / test **2263/2263**（2257 基线 +6）；覆盖率 **90.65/85.62/91.45/92.68**（基线 90.63/85.51/91.45/92.68——全维只升不降）。
- **编译形态冒烟实测过**：`bun build --compile` 单文件（64MB）直执行——get_host_info 应答、thread/start worker `/$bunfs/` 自 spawn、script provider 全事件旅程（agent/inbox/spliced insert→claim、user/message、turn/start、llm/chunk text-delta/usage/finish、assistant/message 权威终局、turn/end{reason 判别}、agent/status、settled{sendId:"p1",ok:true}）、stdin EOF exit 0。事件帧序实证与 §1.2 宣言一致。
- 摸底产出：**thread/start `provider?` 实测被忽略**（松类型残留字段，装配面只认 modelId 三级消歧——app 侧停发，B-L5 关闭）；script-1 无 maxTokens（输出上限 DEFAULT_MAX_TOKENS 回落）+ worker 单例共享剧本游标——W6 编排约束成立。

