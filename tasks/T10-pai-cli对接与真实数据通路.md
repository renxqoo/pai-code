# T10 · pai-cli 对接与真实数据通路 方案
> 状态：定稿
> 级别：大（新子系统：真实协议客户端跨 main/preload/renderer 三层；借 feature-dev-v2 大级纪律，规格基线 = pai-cli `docs/api.md`（v0.5，36 命令 / 8 输出帧），本仓库不重复其规格，只定义本仓库侧的契约与折叠语义）
> 前置：T0（contracts/mock）已实施；T8 渲染层 UI 已按 demo 数据模型交付（`apps/electron/src/renderer`，视图模型 `thread-model.ts`）。

## 契约

### 外部契约（对 pai-cli，真相在 hub 仓库 docs/api.md，不在此复述规格）

本仓库侧镜像：`packages/contracts/src/hub-protocol.ts` 同步到 v0.5——36 命令词表、8 帧词表（`response`/`event`/`ui_request`/`heartbeat{subagents?}`/`hub_error`/`thread_died`/`subagent_event`/`subagent_message`）、`ThreadListEntry`。镜像只做形状收窄与判别联合，不做行为。

### 渲染层 API 面（contracts `api.ts` 重定义，主进程 api 服务实现并校验）

方法名（应用语义，渲染层不出现协议字面量；协议字面量只住 adapter/contracts 镜像/夹具）：

| 方法 | params → result | 翻译为 |
| --- | --- | --- |
| `app/bootstrap` | `{}` → `{threads: SessionView[], settings: AppSettings}` | 注册表 + `thread/list` + `get_models` |
| `app/openSettings` / `app/closeSettings` | 仅渲染层本地（无 invoke） | — |
| `app/settings/get` · `app/settings/patch` | `AppSettings` | 主进程 settings.json（safeStorage 封 key） |
| `session/start` | `{cwd, provider?, modelId?}` → `SessionView` | `thread/start` + 注册表 upsert + 自动标题 |
| `session/resume` | `{sessionPath}` → `SessionView` | `thread/resume` + 注册表 upsert |
| `session/stop` | `{threadId}` | `thread/stop` + 注册表标记 closed |
| `session/listSaved` | `{cwd?}` → `SavedSessionView[]` | `thread/list_saved` |
| `session/prompt` | `{threadId, message, streamingBehavior?}` | `prompt` |
| `session/steer` / `session/followUp` | `{threadId, message}` | `steer` / `follow_up` |
| `session/abort` | `{threadId}` | `clear_queue` + `abort` |
| `session/messages` | `{threadId}` → `HistoryItem[]`（正规化） | `get_messages` + adapter 历史映射 |
| `session/state` | `{threadId}` → `ThreadStateView` | `get_state` |
| `session/stats` | `{threadId}` → `SessionStatsView` | `get_session_stats` |
| `session/setName` | `{threadId, name}` | `set_session_name` |
| `session/setModel` | `{threadId, provider, modelId}` | `set_model` |
| `session/setThinking` | `{threadId, level}` | `set_thinking_level` |
| `session/compact` | `{threadId}` | `compact` |
| `model/list` | `{}` → `ModelInfoView[]` | `get_models` |
| `auth/list`·`auth/setKey`·`auth/removeKey` | 同协议 | `auth/*` |
| `dialog/respond` | `{requestId, payload}` | `ui_response`（任何情况下必答） |
| `subagent/steer` | `{threadId, subagentId, message}` | `subagent/steer` |

错误形态：`invoke` 结果判别联合 `{ok:true,data} | {ok:false,reason}`（沿 contracts 既有 Client 约定由主进程封装；hub `success:false` 的 error 透传为 reason）。

### 渲染层事件词表（contracts `ui-events.ts` 重定义，adapter 产出，渲染层折叠）

- 主机：`host` `{phase:'starting'|'ready'|'restarting'|'failed'}`；`sessionDied` `{threadId,reason}`
- 会话表：`sessionUpdated` `{session:SessionView}`（upsert 语义，单一真相形状）、`sessionRemoved` `{threadId}`
- 对话流（同线程有序）：`turnStarted{threadId,at}` · `userMessage{threadId,message{id,text,origin:'user'|'system'}}` · `messageStarted{threadId,messageId}` · `textDelta{threadId,messageId,delta}` · `thinkingDelta{threadId,messageId,delta}` · `toolCallAdded{threadId,messageId,call{id,name,argsPreview}}` · `toolUpdated{threadId,callId,output}` · `toolEnded{threadId,callId,output,isError,durationMs}` · `messageFinal{threadId,message:AssistantMessageView}` · `turnSettled{threadId,usage?}` · `turnAborted{threadId}` · `queueChanged{threadId,steering,followUp}` · `streaming{threadId,active}` · `compacting{threadId,active}` · `retrying{threadId,attempt,maxAttempts,errorMessage}`
- 子代理：`subagentStarted{threadId,subagentId,agent,task}` · `subagentDelta{threadId,subagentId,text}` · `subagentTool{threadId,subagentId,call,phase:'start'|'update'|'end',…}` · `subagentSettled{threadId,subagentId}` · `subagentMessage{threadId,subagentId,agent,text,to?}`
- 对话框：`dialogRequest{threadId,requestId,method,title?,message?,options?,defaultValue?,deadlineAt?}` · `dialogSettled{requestId}`
- 直执行：`bashOutput{threadId,id?,delta}`（v1 无 UI 入口，事件保留）

关键折叠语义（渲染层状态机，见「测试口径」）：
- 流式正文只拼 `text_delta`，`messageFinal` 为权威替换；`messageFinal.message.text` 与已拼文本不一致时以权威为准。
- 「回复完成」信号 = `turnSettled`（`agent_settled`）；`agent_end` 可能因 auto-retry 多次，不驱动 UI 终态。
- 用户消息两条来源：本地 prompt 回显（origin:'user'）与 `[task-notification]`/`[task-message]` 注入（origin:'system'，`entry_appended` 的 user 消息里以信封前缀识别）；`bashExecution` 历史消息映射为命令行条目。
- abort 后 settle 的轮次标 `stopped`；`streaming{active}` 驱动输入框可用态与 steer/followUp 选择。

## 问题域

- 处理：spawn/监督 pai-cli host（心跳 1Hz、>10s 挂死 → SIGKILL 进程组 → 重启 → 按注册表 resume）；命令往返（id 关联、16MiB 行上限、LF 唯一分隔且 U+2028/2029 不断行）；帧→事件映射；历史水化（`get_messages`）；渲染层折叠状态机与全部交互（对话/队列/停止/模型/思考档/压缩/对话框/子代理/认证/会话管理/崩溃横幅）；注册表持久化（窗口重开恢复会话）；models.json 生成与 key 注入。
- 不处理（归属写清）：
  - 权限规则编辑 UI —— hub 默认规则 + confirm 对话框已构成可用闭环；rules 文件归用户/hub 侧维护（本版 `get/set_permission_rules` 不进 API 面）。
  - fork/clone/navigate_tree 的 UI 入口 —— 「编辑重发」v1 = 回填草稿重发（不改历史）；分叉 UI 归后续任务（协议面已具备）。
  - 直执行 bash（`!` 前缀）UI 入口 —— 归后续任务；`bashOutput` 事件已保留通路。
  - 线程并发限流与预算熔断（T4）—— 本版不限流；pai-cli worker 按对话隔离且闲置自动回收。
  - 子 agent 的 `subagent/steer` UI —— API 面已含方法，面板交互归后续任务。
  - 多窗口 —— 单窗口多会话切换。
  - 会话内搜索/斜杠命令补全（`get_commands`）—— 归后续任务。

## 并发/一致性预算

- 心跳：1Hz；>10s 无心跳判挂死；重启退避 0s/2s/5s（封顶 5s）；重启后按注册表逐个 `thread/resume`，单会话 resume 超时 30s 不阻塞其余。
- stdout 背压：帧解码按 chunk 增量，单行上限 16MiB（超限整行丢弃）；pending 命令 Map 上限 1024（超出即拒绝并回 `{ok:false,reason:'busy'}`）。
- 渲染层更新：流式 delta 直写 store（zustand 选择器窄订阅）；文本拼接用累积 buffer，单 assistant 消息文本上限 4MiB（超出截断显示，防内存失控）。
- 定时器：主进程全局唯一心跳监督定时器 + 各对话框 deadline 定时器；渲染层 1 个活动计时器（有活动时 1Hz）。
- 退出时序：app quit → stdin.end() → 等 host exit（上限 5s）→ SIGKILL 进程组兜底；对话框未决时 host 侧自决（协议保证）。

## 拆分

- `packages/contracts`：hub-protocol v0.5 镜像；`ui-events.ts`/`api.ts` 重定义；`ports.ts` 收窄为主进程装配所需（HostProcessPort、RegistryStore）。
- `packages/adapter`（新）：`frame-decoder`（增量 LF 切行 + JSON 解析 + 帧分类）、`command-encoder`、`event-mapper`（AgentSessionEvent/帧 → UiEvent；含 subagent 帧折叠为子代理事件）、`history-mapper`（AgentMessage[] → HistoryItem[]，含 bashExecution、diff 提取）、夹具库。唯一认识协议字面量的实现包。
- `packages/infra`：`host-process`（spawn/stdin/stdout/心跳监督/优雅退出/重启编排，Electron-free）、`registry-store`（node:sqlite）。
- `apps/electron/src/main`：装配根（配置注入：bunPath/hubEntry/agentDir/env）、api 服务（zod 校验 + 方法翻译 + 注册表联动）、models.json 生成、IPC。
- `apps/electron/src/renderer/src/live`：折叠状态机（纯函数 reducer）、store、水化、`use-live-workspace`、PreloadClient；UI 接线与新增组件（对话框层、系统消息行、thinking 块、崩溃横幅、设置页、新会话流程、队列提示）。
- 依赖方向：renderer → contracts/ui；main → adapter/infra/contracts；adapter → contracts；infra → contracts。业务包零 `import 'electron'`。

## 实施顺序（每批四门全绿后提交）

1. **B1 contracts**：镜像 v0.5 + 词表重定义 + 契约测试更新。验收：词表封闭断言双向。
2. **B2 adapter**：解码/编码/映射/历史 + 单测 + 夹具。验收：帧解码表驱动（含 U+2028、16MiB、垃圾行）、事件映射全表、历史映射全表。
3. **B3 infra**：host-process + registry-store + fake-host 脚本集成测试（spawn/心跳/挂死重启/恢复/退出）。验收：集成测试绿。
4. **B4 main 装配**：api 服务 + 配置生成 + IPC 接线。验收：主进程模块单测绿 + dev 启动可达 bootstrap。
5. **B5 渲染层状态层**：reducer + store + 水化 + 单测（时序全表）。验收：折叠语义测试全绿。
6. **B6 UI 接线**：live workspace 替换 demo 装配（demo 保留用于组件测试）、对话框层、系统消息、thinking、设置页、会话管理。验收：dev 全流程可用。
7. **B7 集成/e2e**：真 pai-cli（bun + dist/cli.js）集成测试（命令往返/流式折叠/对话框/恢复）+ 覆盖率核点。
8. **B8 对抗审查 + 收口**：独立会话审 diff；四门 + 覆盖率数字 + 真 app 人工验证记录。

过渡态：B6 前渲染层仍挂 demo（联调点在 `app.tsx` 一处装配）；B6 收口后 demo 仅存于组件测试夹具（生产装配单轨走 live）。

## 裁决

- 用户裁决（任务指令）：pai-cli 承担协议与进程管理（worker/会话/权限判定/沙箱/凭据落盘）；本仓库只做 UI 渲染与协议客户端；交付必须真实验证 app 可用，不接受「差不多」。
- 默认裁决（否决窗口随实施提交）：单窗口单 host；会话恢复 = 启动时按注册表逐个 resume（worker 闲置自动回收，无需手动 parked 管理）；自定义 provider 的 key 用 safeStorage 加密存 app settings、spawn 时 env 注入、UI 永不回显；`Esc` = 清队列 + 停止（对齐 api.md）；自动标题 = 首条用户消息前 40 字符经 `set_session_name`。
- 默认裁决：v1 不做的面见「问题域·不处理」，均已在协议/事件层预留通路（无死路）。

## 测试口径

- 契约断言：命令词表 36 双向封闭；帧词表 8 双向封闭；UiEvent/API 方法词表封闭（新增先改表）。
- 帧解码表驱动：完整行/半行跨 chunk/U+2028·U+2029 不断行/CRLF/空行跳过/超 16MiB 丢弃/非法 JSON 降级/非对象行降级。
- 事件映射表：全部 AgentSessionEvent 类型 → UiEvent（或显式忽略清单）；subagent 帧 → 子代理事件组；user-role 注入识别（`[task-notification]`/`[task-message]` 信封）。
- 折叠状态机时序：prompt 回显→流式→工具→权威替换→settle（恰好一次终态）；abort→stopped；auto_retry 期间不终态；queue 变化；双消息交错（同线程顺序）；晚订阅/重水化幂等（history 重放不重复）。
- 历史映射：user(string|数组) 双形态扁平化；assistant text/thinking/toolCall 分组；toolResult 配对（isError、exitCode 推导）；bashExecution 条目；edit/write diff 提取（patch 解析 ± 行数与路径）。
- host 集成（fake-host 脚本）：命令 id 关联回包；心跳超时触发重启+resume 序列；stdin EOF 优雅退出；exit 非 0 处理。
- e2e（真 pai-cli + 真 bun，opt-in env）：start→prompt→（脚本化 provider 替身或 GLM env）流式折叠→对话框应答→stats→stop→resume。
- 越权/安全面：dialog/respond 只认未见/已见 requestId 的幂等；key 不出现在任何日志/事件/IPC 回显；preload 面最小（invoke/subscribe/window）。

## 验收清单

- [ ] 契约：36 命令/8 帧镜像与词表断言；渲染层 API/事件词表封闭。
- [ ] 边界：16MiB 行、U+2028、垃圾帧、挂死重启、resume 幂等、晚订阅、消息双形态、空会话、未知 threadId 降级。
- [ ] 并发预算逐条（心跳/背压/定時器/退出时序）。
- [ ] 四门全绿 + 覆盖率 ≥90/85（如实报数字）+ 真 app 端到端人工验证记录（对话、流式、工具、对话框、子代理、恢复）。
