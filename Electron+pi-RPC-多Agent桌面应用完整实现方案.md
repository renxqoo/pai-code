# Pai · Electron + pi-hub 多对话多 Agent 桌面应用 · 实现方案

> 状态：草稿（待评审定稿）
> 本文只描述当前设计。任务拆分见 `tasks/`（开工前先读对应任务文档）；开发规则见 `AGENTS.md`。

---

## 第 0 章：架构总览

```
┌──────────────────────────────────────────────────────────┐
│ apps/electron                                             │
│   main：组合根（DI 装配）+ 窗口/托盘/生命周期/加固/打包      │
│   renderer：挂载 @paiapp/ui + 注入真 Client                │
└────────┬─────────────────────────────────────────────────┘
         │ Client（invoke / subscribe / capabilities）
┌────────▼─────────────────────────────────────────────────┐
│ packages（全部 Electron-free）                             │
│   contracts ← core ← infra ← api ← ui                     │
│   infra/process：HubSupervisor ── spawn ──────┐           │
└───────────────────────────────────────────────│──────────┘
                                                ▼
                     bun 二进制 → pi-hub（单进程，多 thread）
                     thread#1…#N（pi SDK 进程内 AgentSession）
                     agentDir = userData/agent（与 ~/.pi 彻底隔离）
```

### 关键决策（全部已裁决）

| # | 决策 | 内容 |
| --- | --- | --- |
| 1 | Agent 宿主 | **单 pi-hub 进程**（独立仓库，协议文档是其唯一真相）；Pai 不修改 hub 代码 |
| 2 | hub 运行时 | **随包 bun 二进制**运行 hub（dev 直连 hub 仓库；打包带 bun + hub 产物） |
| 3 | OS 沙箱 | **归属 hub**（hub 自行包裹，Pai 不经手 spawn 包裹）；Pai 只提供设置交互，一切经协议提交 |
| 4 | 权限 | **Pai 只做 UI 交互，操作全部经协议提交给 hub**：确认对话框回 `ui_response`；权限规则编辑走 hub 的 rules 命令；trusted 审批是 `thread/start` 参数 |
| 5 | 线程并发上限 | **Electron 客户端限流**（hub 协议不含上限）：全局动态 2..8、单对话 ≤3、排队 |
| 6 | TypeScript | **TS 7**，与 pi-hub 工具链对齐 |
| 7 | monorepo | bun workspaces；scope `@paiapp/*`（产品名 pai）；包不独立构建（TS 源码直出，仅 apps 出产物） |
| 8 | 分层强制 | oxlint 插件 `pai/*`（jsPlugins，`oxlint-plugins/pai/`）挂 lint 门禁；packages 出现 `import 'electron'` 或越层依赖即失败 |
| 9 | UI 复用边界 | ui 只认 contracts + Client 接口（invoke/subscribe/capabilities），Electron 逻辑零进入 |
| 10 | 协议真相 | hub 协议类型镜像进 `contracts`（同步以 hub 仓库 `docs/design.md` + `src/protocol.ts` 为准）；API 方法 schema（zod）也在 contracts，api 与 Client 同源 |
| 11 | agentDir | `userData/agent`（`PI_CODING_AGENT_DIR`），auth/sessions/settings/extensions 全部与 `~/.pi` 隔离（hub 侧裁决） |
| 12 | 凭据安全 | spawn hub 时清洗全部 provider key 环境变量；key 只经 `auth/set_api_key`（stdin）进 hub 侧 auth.json，Electron 零接触零回显；遥测与升级检查外联关闭 |
| 13 | 会话真相源 | hub 管理的 session jsonl（agentDir/sessions）；Pai 的 SQLite 只存视图元数据与恢复快照（见第 5 章） |
| 14 | 认证 | **仅 API key**（auth/list、set_api_key、remove_key）；无 OAuth |
| 15 | 存活判定 | hub 心跳帧 1Hz；**>10s 无心跳 = hub 挂死** → SIGKILL 进程组 → 重启 → `thread/resume` 全部活跃线程 |
| 16 | 构建工具 | Bun（install/script/test）+ Vite electron-vite（main/preload/renderer 三面），详见第 16 章 |

---

## 第 1 章：仓库与分层

```
pai/
├── apps/electron/          # main：组合根 + IPC 绑定 + 生命周期 + 加固 + 打包；renderer：挂 ui
├── packages/
│   ├── contracts/          # 类型 + 事件词表 + hub 协议镜像 + API schema(zod)；零运行时依赖
│   ├── core/               # 领域逻辑：thread 调度/用例；定义 Port（AgentHostPort/StorePort/…）
│   ├── infra/              # Port 实现：process（HubSupervisor）| store（node:sqlite/SessionReader）| system
│   ├── api/                # 服务实现：编排 + 校验 + 事件总线（transport 无关）
│   ├── ui/                 # React + shadcn：组件 + Zustand store + hooks + strings + Client 接口
│   └── testkit/            # fake-hub / 回放器 / mock Client / 隔离世界
└── tasks/                  # 方案与任务文档（hub 仓库独立在外部）
```

**依赖白名单矩阵**（oxlint 插件 `pai/no-cross-package-imports` 强制，规则即此表）：

| 包 | 允许 import |
| --- | --- |
| contracts | 无 |
| core | contracts |
| infra | contracts, core |
| api | contracts, core, infra |
| ui | contracts |
| testkit | contracts |
| apps/electron | 全部 + electron |

**分层不变量**：core 只定义 Port 不实现；infra 全部纯 Node；apps/electron 的 main 是唯一组合根（DI 装配）；ui 通过 Client 接口与传输解耦。判断标准：换环境就要重写的代码进 infra，到哪都一样的进 core。

---

## 第 2 章：pi-hub 集成（infra/process）

hub 是独立仓库的独立工具链项目（bun/oxlint/oxfmt/tsc），与本应用的全部交互 = **JSONL stdio 协议**。协议语义（恰好一次 response、事件帧全局有序、对话框 settle 恰好一次、stdin EOF 优雅退出、16MiB 行上限等）以其 `docs/design.md` 为唯一真相，本章只定义 Pai 侧的消费姿态。

### 2.1 spawn 配置

```typescript
// infra/process/hub-supervisor.ts（职责仅进程生命周期与字节管道）
spawn(bunBinaryPath, [hubEntryPath], {
  cwd: defaultWorkspace,
  env: {
    ...scrubProviderKeys(whitelistEnv()),    // env 白名单重建 + 清洗 provider key
    PI_CODING_AGENT_DIR: agentDir,           // userData/agent
    PI_SKIP_VERSION_CHECK: '1',              // 关闭升级检查外联，保留模型目录刷新
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',    // 进程组：kill 时连孙进程
  windowsHide: true,
});
```

- `bunBinaryPath`/`hubEntryPath`：dev = 系统 bun + hub 仓库 `src/cli.ts`（路径来自设置）；prod = extraResources 内的 bun 二进制 + hub `dist/cli.js`（启动时哈希清单校验）。
- stdout 喂帧解析器（第 3 章）；stderr 采集环形缓冲（64KB）供诊断与网络/凭证错误识别。hub 保证协议帧走原始句柄串行写出；偶发 stray log（Bun 下 console 直写缺口）按非 JSON 行降级计数，不崩溃。

### 2.2 存活与恢复

| 场景 | 检测 | 动作 |
| --- | --- | --- |
| hub 正常退出（我方主动关闭 stdin） | exit 事件 | 预期路径，无事 |
| hub 崩溃 | exit(非预期) | 自动恢复 1 次：重启 hub → 按 SQLite 快照逐个 `thread/resume {sessionPath, cwd}` → 再败标 interrupted 交用户 |
| hub 挂死（事件循环阻塞） | 心跳 >10s 缺失 | SIGKILL 进程组 → 同上恢复链 |
| Electron 主进程死亡 | hub 侧 stdin EOF | hub 自行优雅退出并 flush 会话（协议级无孤儿） |
| 我方写失败（EPIPE） | stdin error | 标记 hub 死亡，走崩溃路径；写队列毒化自愈 |

恢复快照：thread 状态变化（start/resume/stop）即落 SQLite；恢复期间 UI 显示「宿主重启中」横幅，逐 thread 结果可见。

### 2.3 Pai 消费的协议面（摘要，细节以 hub design.md 为准）

- **命令**：`thread/start|resume|stop|list|list_saved`、`prompt`（流式中必须带 `streamingBehavior:"steer"|"followUp"`）、`steer`、`follow_up`、`abort`、`compact`、`get_state`、`get_messages`、`set_model`/`get_models`、`set_thinking_level`、`ui_response`、`auth/list|set_api_key|remove_key`、权限规则读写命令（`rules` 类，hub 提供，Pai 调用）。
- **帧**：`response{id,command,success,data|error}`（id 关联，恰好一次）、`event{threadId,event}`（负载 = AgentSessionEvent；message_update 已剥离累积快照）、`ui_request{requestId,method,...}`、`heartbeat`（1Hz）、`hub_error`。
- threadId 即 pi session id，`thread/start` 的 response 返回 `sessionPath`——SQLite 记录映射，不自造路径。
- 同一 session 双开由 hub 内部拒绝；跨进程双开由 Pai 单实例锁 + 唯一活跃 hub 保证。

---

## 第 3 章：协议适配（packages/adapter）

全项目只允许 adapter 认识 hub 协议字面量（帧类型、命令类型、AgentSessionEvent 字段名）；CI 扫描越界即失败。

```typescript
// 双向职责
decodeFrame(line: string): Frame | null              // response/event/ui_request/heartbeat/hub_error 分发
encodeCommand(cmd: PaiCommand): string               // thread/*、prompt/steer/follow_up/abort、rules/*、auth/*、ui_response
mapSessionEvent(threadId, ev: AgentSessionEvent, ctx): { ui: UiEvent | null; internal: InternalEvent | null }
// internal: turn_started / turn_ended / message_end{usage} / tool_call —— 供预算与对话框桥消费
```

- 分帧规则与 hub 一致：LF 唯一分隔、容忍行尾 `\r`、**U+2028/U+2029 不是分隔符**（禁用 Node readline）、16MiB 行上限整行丢弃 + 计数。
- 事件映射要点：`message_update` 的 `assistantMessageEvent.type` 分流（text_delta / thinking_delta / toolcall_delta）；工具事件字段 `toolCallId`/`toolName`；usage 取自 `message_end`。
- 夹具库 `tests/fixtures/hub-frames/`：真 hub smoke 输出录制 + 手工构造（对话框、auth、错误帧），每 PR 回归。
- 未知帧/未知事件：计数 + 采样日志，不崩。

---

## 第 4 章：权限与安全边界

### 4.1 权限（hub 权限门 + Pai 纯交互）

- 判定、拦截、规则热读、5 分钟未确认默认拒绝——**全部在 hub**。
- **Pai 只做两件事**：① 渲染 `ui_request` 对话框并把用户选择经 `ui_response` 提交回 hub；② 设置页经 hub 的 rules 协议命令读写规则（模式 + glob 表）。Pai 不写规则文件、不镜像判定逻辑（设置页可做纯展示性的匹配预览，权威判定在 hub）。
- `trusted` 审批 = `thread/start` 的参数；逐项目显式审批由 Pai 记录视图态，提交给 hub 执行。

### 4.2 对话框桥（Pai，packages/approval）

`ui_request` 全方法族（confirm/select/input/editor/notify/setStatus）→ UiEvent → 渲染层对话框 → `ui_response{id,payload}` 回包；晚到/未知 id 静默忽略（hub 已 ack）；渲染层刷新后经挂起对话框快照重水化；超时兜底在 hub（UI 同步倒计时与结果展示）。

### 4.3 OS 沙箱（归属 hub）

hub 自行实施 OS 级沙箱（读 agentDir 配置自行包裹）；Pai 不经手 spawn 包裹、不实现 profile。Pai 侧仅有设置交互（若 hub 暴露配置接口则经协议提交）与状态展示。Pai 的进程面安全责任仅剩：Electron 加固（下节）与 spawn env 清洗（第 2 章）。

### 4.4 Electron 加固（apps/electron）

- Fuses：`RunAsNode=off`（hub 由 bun 二进制运行，本应用不使用该能力）、`EnableNodeOptionsEnvironmentVariable=off`、`EmbeddedAsarIntegrityValidation=on`、`OnlyLoadAppFromAsar=on`、`EnableCookieEncryption=on`。
- IPC：每个 handler 校验 `event.sender === 主窗口`；参数 zod；`workspaceDir` 必须与已登记值匹配。渲染层 Markdown DOMPurify、`setWindowOpenHandler` 拒绝、`will-navigate` 拒绝。
- CSP：生产经自定义 `app://` 协议下发 `script-src 'self'; connect-src 'self'`；dev-only 放行 localhost 且不进生产构建。
- bun 二进制 + hub 产物（extraResources）：构建期哈希清单，启动校验。

---

## 第 5 章：持久化

```
agentDir = userData/agent/（hub 管理，PI_CODING_AGENT_DIR）
  auth.json（hub 独占写）        models.json / models-store.json / settings.json
  sessions/<cwd-hash>/*.jsonl（会话真相源，hub 独占写）
  extensions/ skills/ themes/    permission-rules.json（hub 读写；Pai 经协议编辑）

SQLite（node:sqlite，Pai 独占）= userData/app.db —— 只存展示层事实：
  conversations: id | title | workspace_dir | created_at | last_activity_at | pinned | archived
  threads:       thread_id(PK) | conv_id | session_path(UNIQUE) | cwd | model | provider
                 | status | trusted | created_at | updated_at | finished_at
  usage_daily:   date | tokens
  settings_kv:   key | value（zod 校验）
  agent_templates: id | name | version | config_json
```

- 分工原则：**hub 管「发生过什么」（会话真相源）；Pai 管「用户怎么看待和恢复这些事」（视图账本）**。Pai 的库损坏/丢失只损失排序与分组，对话内容零损失。
- 恢复/重水化以协议为主（`thread/list` + `get_state`/`get_messages`）；SessionReader（worker，尾部反读、截断尾行容忍）仅作 hub 不可用时的离线兜底。
- 调试事件留档：**不落库**，进程内环形缓冲（上限 4MB 自动丢弃），仅排障导出。
- 迁移框架：PRAGMA user_version，启动早期同步执行。

---

## 第 6 章：并发与预算

- **客户端限流**（hub 不限）：全局活跃 thread ≤ `clamp(物理内存 ÷ 实测单 thread RSS, 2, 8)`（启动默认 4，按实测校准）；单对话 ≤ 3；超出的进队列（可见对话优先、阻塞跳过、位置合并广播）。
- steering：运行中 `steer`；流式中按 `streamingBehavior` 语义编码；排队期消息缓冲、启动后补发。
- BudgetTracker：消费 `message_end{usage}` 累计，日预算（本地时区日界）超限 → 熔断闸（新任务 rejected + 闩锁单次广播，调高限额自动解除）。
- StreamAggregator：全局单 50ms 定时器、按 threadId 分桶；仅聚合 chunk；非 chunk（对话框/turn_end）立即冲刷保序；每桶单调 seq。

---

## 第 7 章：性能清单

| # | 问题 | 堵法 |
| --- | --- | --- |
| 1 | token 级事件洪泛 | StreamAggregator 50ms/桶批推（hub 已剥离累积快照，帧大小恒定） |
| 2 | 大工具结果挤爆 IPC | adapter 截断 4KB；「展开全部」优先 `get_messages`，SessionReader 兜底 |
| 3 | 大行 JSON.parse 阻塞主进程 | 帧解析 + 映射在 worker_threads；16MiB 行上限整行旁路 |
| 4 | 渲染长对话卡顿 | react-virtuoso + 超 500 条分页 |
| 5 | Zustand 高频更新抖动 | 按 thread 精确订阅 + copy-on-write + useShallow；流式正文 transient + rAF 直写 |
| 6 | 不可见对话事件全量推送 | 主进程按可见性降级（状态机事件 + 节流末次 chunk） |
| 7 | 内存泄漏 | thread 终态清表；hub 单进程 RSS 监控 + 阈值告警（重启用恢复链）；stderr 环形缓冲 |
| 8 | 启动慢 | 窗口骨架屏 → SQLite → spawn hub（异步）→ 探测并行 |
| 9 | 恢复大会话慢 | 恢复走协议（增量、流式）；离线兜底走 SessionReader 尾读 |
| 10 | 热路径日志 | release 默认 info + 异步；未知帧计数同步、日志采样 |

---

## 第 8 章：安全清单（逐条验收）

- [ ] 渲染进程 contextIsolation/sandbox/nodeIntegration 三项 + preload 白名单 + 取消订阅
- [ ] 每个 handler 校验 sender + zod + 资源归属（workspaceDir/threadId 必须已登记）
- [ ] Markdown 净化 + 窗口策略（setWindowOpenHandler/will-navigate 全拒）
- [ ] **API key 零接触**：只经 `auth/set_api_key`（stdin）进 hub 侧 auth.json；spawn env 清洗 provider key；任何输出帧/日志/错误不回显 key（Pai 侧断言）
- [ ] agentDir 与 `~/.pi` 彻底隔离；遥测/升级检查外联关闭
- [ ] 权限操作全部经协议（ui_response / rules 命令 / trusted 参数）；Pai 无规则文件写入路径、无判定逻辑副本
- [ ] Fuses 全表 + asar 完整性 + bun/hub 产物哈希清单启动校验
- [ ] CSP via app:// 协议；dev 放行不进生产构建
- [ ] 代理凭证存 OS keychain，SQLite 只存 host:port；流量可见性提示
- [ ] 自动更新 HTTPS + 签名校验不可关；回滚 = 上一目录一键切换；运行中任务时更新需确认
- [ ] 日志结构化 {module, threadId?}；Sentry 字段白名单 + 采样；不上报调试缓冲内容
- [ ] 遥测默认关 + 首启显式询问；诊断导出经脱敏

---

## 第 9 章：故障矩阵

| 故障 | 检测 | 行为 |
| --- | --- | --- |
| hub 崩溃 | exit(非预期) | 自动恢复 1 次（重启 + resume 全部）→ 再败标 interrupted 手动恢复 |
| hub 挂死 | 心跳 >10s 缺失 | SIGKILL 进程组 → 同上恢复链；UI「宿主重启中」横幅 |
| Electron 主进程死亡 | hub stdin EOF | hub 优雅退出并 flush（协议级无孤儿） |
| 帧解析失败/坏行 | 非 JSON / 超长行 | 整行丢弃 + 计数；不崩 |
| hub_error 帧 | 帧本身 | 上报 UI + 日志；进程存活不重启 |
| 对话框超时 | hub 侧默认拒绝 | UI 显示已自动拒绝结果 |
| 同一 session 双开 | hub response failure | 透传 rejected(session_busy)，UI 提示占用 |
| session 损坏 | thread/resume failure | 放弃恢复，提示开新对话 |
| auth 失效/过期 | 事件流错误/401 特征 | 引导重新设置 key（auth 命令组）；不计为崩溃 |
| bun 二进制/hub 产物缺失或校验失败 | 启动哈希清单 | 拒绝启动 + 诊断指引 |
| agentDir 缺失/磁盘满 | spawn/写失败 | 初始化重建 / 全局告警暂停新任务 |
| SQLite 损坏 | open 抛错 | 备份重建空库；thread 映射丢失时经 thread/list_saved 重建 |
| 渲染进程崩溃/刷新 | render-process-gone | 挂起对话框 + thread 快照重水化（thread/list + get_state） |
| workspace 运行中消失 | thread 事件错误特征 | 该 thread 标异常挂起，不自动重试 |
| 网络/代理故障 | offline 检测 + stderr 特征 | UI 离线横幅 + 代理设置入口 |
| 预算超支 | BudgetTracker | 熔断：新任务 rejected + 通知；调高限额自动解除 |

---

## 第 10 章：渲染层与 Client

```typescript
// Client 接口（contracts，ui 唯一依赖）
interface Client {
  invoke(method: ApiMethod, params: unknown): Promise<unknown>;   // zod 校验的 API 面
  subscribe(events: (e: UiEvent) => void): Unsubscribe;
  capabilities: { fileDialog: boolean; systemNotification: boolean; /* … */ };
}
```

- agentApi 面：对话 CRUD/可见性、thread start/prompt/steer/abort/stop/resume、`respondDialog(requestId, payload)`、auth list/set/remove key、权限规则读写（协议透传）、设置、`getStateSnapshot()`（thread 摘要 + 排队 + 挂起对话框，重水化用）。
- 两层状态机：thread 级 `queued → starting → running ⇄ idle → stopping → stopped / crashed(重启中) / interrupted → resuming`；turn 级 `idle → streaming ⇄ awaiting_dialog → aborted / turn_end(usage)`。
- 对话框事件是普通 UiEvent（dialog_request），由 4.2 桥产生。

---

## 第 11 章：配套模块

| 模块 | 说明 |
| --- | --- |
| 认证中心 | auth/list 凭据状态页；API key 设置/移除（key 零回显，仅经 auth 命令组走 stdin）；无 OAuth |
| 模型/Provider 选择 | get_models/set_model；per-conversation 记忆（threads.model） |
| 成本展示 | usage_daily 聚合，对话级 + 应用级 |
| 生命周期与驻留 | 托盘 + 退出确认 + before-quit → hub 优雅停（stdin EOF 路径）→ quit；powerSaveBlocker |
| 网络模块 | 代理（keychain）/根证书/offline 检测/stderr 特征识别 |
| 数据治理 | 会话导出、agentDir 清理/备份 UI、诊断包（脱敏）、遥测默认关 |
| 系统通知 | 后台 thread 完成/需确认；权限拒降级徽标 |
| 深色模式与文案 | nativeTheme ↔ shadcn 同步；strings 单一真相 |

---

## 第 12 章：打包与测试

```json
// electron-builder 要点
{
  "files": ["dist/**"],
  "extraResources": [
    { "from": "resources/bun", "to": "bun" },
    { "from": "resources/hub", "to": "hub" }
  ],
  "mac": { "hardenedRuntime": true, "entitlements": "entitlements.plist", "minimumSystemVersion": "13.0" },
  "win":  { "signingHashAlgorithms": "sha256" },
  "afterSign": "notarize.js"
}
```

- entitlements 只保留 Electron 标准键；hub 由 bun 运行，与 Hardened Runtime 无冲突。
- 测试矩阵：单元/夹具（bun test，每 PR）/ 组件（happy-dom，每 PR）/ integration（真 hub + 真 bun，opt-in LLM 门，每夜）/ 混沌（kill -9 hub、心跳停、坏帧流、EOF、长跑内存，每夜）/ E2E（Playwright：3 对话 × 2 thread 不串线 + 刷新重水化，发版门）/ 打包冒烟（含 EDR 机器，发版门）。

---

## 第 13 章：Spike 清单（动工前）

| # | 项 | 通过标准 |
| --- | --- | --- |
| 1 | bun 二进制随包分发 | 三平台 extraResources bun + hub dist 跑通；锁定与哈希清单 |
| 2 | hub 孙进程行为 | hub 内跑 `npm run dev` 后 kill/EOF，检查孙进程（决定进程组策略细节） |
| 3 | 非 ASCII / NFD cwd | 中文/emoji/NFD cwd 走完 Pai spawn 链路与恢复 |
| 4 | hub 内存画像 | 每 thread RSS P95 + 长跑曲线 → 客户端动态上限校准 |
| 5 | 签名公证冒烟 | mac 公证 + win codesign 真机跑起 hub（含 EDR 机器） |
| 6 | pi 升级回归 | hub 依赖升级时 auth + resume + 事件流夹具回归 |

---

## 第 14 章：里程碑（对应 tasks）

| 阶段 | 任务 | 验收关口 |
| --- | --- | --- |
| 0. Spike | 第 13 章各项 | 有结论，方案冻结 |
| 1. 地基 | T0 | workspaces + contracts 冻结 + mock Client，四门 CI |
| 2. 管道 | T1 + T2 | 帧↔事件稳定解析；hub kill/EOF 恢复链通过 |
| 3. 主链路 | T8(对 mock) + T4 | 单对话全流程可用 |
| 4. 交互层 | T6 | 对话框桥全方法族 + 权限协议交互 |
| 5. 持久化与壳 | T5 + T7 | 重水化/恢复；混沌通过 |
| 6. 收口 | T9 | E2E + 打包冒烟 + 发版 |

---

## 第 15 章：风险

| 风险 | 缓解 |
| --- | --- |
| hub 单点（一死全死） | 恢复链（重启 + resume）+ 会话文件持久 |
| Bun 下 stray log 污染 stdout | hub 已隔离协议帧；Pai 侧非 JSON 行降级计数 |
| hub 协议/SDK 演进 | contracts 镜像类型 + 夹具回归每 PR + 协议字面量边界 lint |
| 权限命令依赖 hub 提供（rules 读写） | 列为外部依赖跟踪；hub 未就绪前设置页降级只读展示 |
| hub 内存随 thread 数增长 | 客户端动态上限 + RSS 阈值告警 + 恢复链重启 |
| pi 升级破坏 auth/session schema | 升级即跑 auth + resume 回归 |

---

## 第 16 章：技术栈定版

| 组件 | 选型 | 说明 |
| --- | --- | --- |
| Electron | 44.x（Node 24.20） | macOS ≥13；主进程跑 Electron 内置 Node |
| React / Zustand / Tailwind / shadcn | 19.2 / v5 / 4.3（显式 @source）/ init `--preset b0 --template vite`（base-nova 线） | shadcn 走 Base UI 原语（`@base-ui/react`）+ `cn` 包 + lucide + tw-animate + Inter 字体；组件经 `bunx shadcn add` 落 renderer 的 components/ui |
| TypeScript | 7（对齐 pi-hub） | strict；tsc --noEmit 独立门 |
| oxlint / oxfmt | 1.8x（--type-aware）/ 0.6x | 0-0 门禁；oxfmt 格式化 |
| Bun | 1.4.2 | install/script/test + **hub 运行时**（随包二进制） |
| 构建 | electron-vite 5 + Vite 7 | main/preload/renderer 三面；包源码直出不独立构建；Vite 8 需等 electron-vite 6 stable |
| SQLite | node:sqlite | Electron 内置；零原生模块 |
| pi-hub | 外部独立仓库 | dev 直连其仓库运行；打包随包 bun + hub 产物；协议文档唯一真相 |

四门（每 PR）：`bun run lint`（0-0）/ `tsc --noEmit` / `electron-vite build` / `bun test`；覆盖率 行/语句/函数 ≥90、分支 ≥85。

---

## 附录：估算

主进程 + packages 约 4000 行，ui 约 2500 行，adapter + testkit + 测试约 1500 行（权限门、OS 沙箱、会话执行均由 hub 承担，Pai 不实现）。
