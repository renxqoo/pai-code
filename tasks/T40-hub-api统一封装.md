# T40：packages/api 统一 host-hub 接口封装（方案 v3 · 三路对抗审查处置后）

> v3 记录（2026-09-21）：三路并行子代理审查（协议/契约面、架构/迁移面、消费/使用面）全量处置。
> 处置索引见 §7（每条 H/M → 落点）。v2 的架构主干部（协议层错误结构化 + transport 单点 +
> 七域门面 + 三圈使用面）经审查与代码事实相容，保留；以下为本版修正要点：
> ①ApiError = HubError | AppError 双联合（三路独立撞车的最大缺口）；②错误发射点实为 ~104
> 处且含非机械映射面（packages 层词表需内层 code 穿透）；③解码链三层 + hub 内部中继层进
> 原子集（漏则落地即全量折平 command_failed）；④api↔infra 依赖环 → 方向翻转裁决；
> ⑤跨仓原子交付 runbook；⑥thread_superseded ≠ unknown_thread 拆词（fork 换轨防误自愈）；
> ⑦超时四档（补 bash 24h）；⑧双侧码表对拍机制（握手暴露 + 启动期断言）。

## 0. 现状底账（审查修正版）

**正则消费面实为 10 处**（v2 记 9，漏 4 补入、2 处死 matcher 修正）：

| # | 消费点 | 匹配 | 处置 |
|---|---|---|---|
| 1 | read-ports.ts:37 | `/unknown command\|unsupported capability\|unknown method/i` | →kind |
| 2 | api-routes.ts:331 | `/streamingBehavior required/` | →kind（保留 `streamingBehavior===undefined` 前置） |
| 3 | live-controller.ts:269 | `=== 'Unknown threadId'` | →kind=unknown_thread（且排除 thread_superseded） |
| 4 | workspace-actions.ts:179/183 | images/too many startsWith | →kind；**#183 是死 matcher**（hub 实串 `invalid images: too many images`，startsWith 永不命中）——行为修复带回归用例 |
| 5 | strings zh/en createFailed | `/thinking/` 等 | →kind 查表；**startsWith('Model not found') 是死 matcher**（hub 实串 `unknown model preset:`）——同上 |
| 6 | workspace-actions.ts fork 文案 | 含 `thread is streaming` | →kind |
| 7 | api-routes.ts:351 | `invalid since cursor` | →kind=cursor_stale |
| 8 | api-routes-resume.ts:102/121 | vanish 正则族（**v2 漏记**，驱动 removeSession 删行） | →kind（session_unreadable 族单独成族，不与 io_failed 混） |
| 9 | api-routes-thread-ops.ts:35 | `/not user-defined\|unknown agent type/`（**漏记**） | →kind |
| 10 | entry-hydration.ts:196 | `/not readable\|thread_id_mismatch/`（**漏记**；hub 串与 app 本地 token 混判） | 拆两支：hub→kind，app token→AppError |

**错误发射点 ~104**（93 respond + worker-pool emitFailure 7 + host.ts 4），四类**非机械**：
catch-all `String(error)` ≥10 处（需 internal 族）；"Session file not readable" 6 处（删行语义，
单设 session_unreadable）；capacity/limit 4 串；bash admission + 协议级（parse failure/shutting
down/invalid id/worker died）；packages 层开放词表（compaction 5 条、archive `corrupt:`）需
**内层 Error 带 code 穿透**（小型重构）。双侧测试断言换形 ~70 处入 W0 触面。

**调用面事实修正**：直连 host.request 实为 **7 处**（pai-runtime :180/:282/:446/:449/:451/:457/:482
+ monitor :118-119 两条）；adapter 消费方 = 主进程 3 文件 + **infra 1 文件**（frame-decoder，
v2 记「全在主进程」有误）+ 矩阵/测试 3 处；超时档实为**四档**（缺省 30s/prompt 10min/
compact 30min/**bash 24h**）。

## 1. 目标与非目标

**目标**：同 v2（错误协议层结构化 / 统一调用管线 / 知识一处 / 事件面同入），另加：
- **ApiError 双联合**：`ApiError = HubError | AppError`——app 本地错误（IPC 层 invalid_payload/
  unknown_method、路由 invalid_params/internal_error、业务闭集 token、git 族 7 词、renderer 本地
  词）是独立闭集 AppError，不污染协议词表；语义可对齐的并族（session_path_forbidden≈
  path_forbidden）。renderer 内部通道（submitDraft `Promise<string|null>`）同步重定型。
- **双侧码表机器对拍**（v2「封闭断言」无机制的补强）：hub 握手/get_host_info 暴露
  `errorCodes` 码表；app 启动期断言集合相等（新增码 → 启动红）；集成门逐码抽样旅程。

**非目标**（范围声明，v2 表述过强的修正）：错误类型安全限定**命令响应面**——事件携带的
错误文本（turnSettled errorMessage、sessionParked/sessionDied frame.reason、hub_error 帧的
message）维持自由文本，不入词表。

## 2. 架构（v3）

### 2.1 错误词表（码↔kind 一一对应，消除 v2 有码无 kind的错位）

```ts
// x-harness protocol/errors.ts（单一真相）——24 族
HUB_ERROR_CODES = [
  // 线程寻址与生命周期
  'unknown_thread',        // 表真缺失/逐出（app 自愈重锚只认它）
  'thread_superseded',     // fork 重键/单会话守卫结算在飞旧 id（自愈禁触发——防复活 fork 前状态）
  'thread_not_live', 'session_unreadable',   // 后者：resume/register 可删行语义（6 站点独立成族）
  'already_open', 'thread_limit',            // capacity 族（too many live threads / in-flight / bash 并发 / response too large）
  // 受理与输入
  'streaming_window', 'invalid_input', 'unknown_command',
  // 能力
  'capability_thinking', 'capability_images', 'images_too_many', 'model_unavailable',
  // 会话状态
  'cursor_stale', 'state_conflict', 'name_conflict', 'trust_required', 'path_forbidden',
  // 基础设施与兜底
  'io_failed', 'internal',        // internal：String(error) catch-all（≥10 站点）
  'bash_denied', 'protocol',      // bash admission；parse failure/shutting down/invalid id/worker died
  'compact_rejected',             // compaction 词表 5 条（内层 code 穿透）
] as const;
// app 侧 errors.ts：每码一个 kind，一一对应；未登记 code → {kind:'unregistered_code', code, message}
//（v2 兜底族名 hub_error 与帧级 hub_error 撞名，改 unregistered_code）
// transient face 对齐 infra 串全集（create-host-process.ts 为单一真相 + 对照断言）：
//   busy | timeout | host_unavailable | host_restarting | host_failed | host_not_running
//   | host_disposed | write_failed | command_failed | bridge_unavailable
```

packages 层穿透：compaction/archive 的内层错误改 `Error.cause` 携 code，dispatch 层发射时
提取——W0 内完成（小型重构，非机械）。

### 2.2 ApiError 双联合与通道

```ts
export type ApiError = HubError | AppError;
// AppError：app 本地闭集（invalid_params / internal_error / unknown_method / session_path_forbidden
//（并 path_forbidden 同文案）/ cwd_not_allowed / cwd_forbidden / malformed_response / thread_id_mismatch
// / unknown_session / export_failed / dialog_unavailable / git 族 7 词 / empty_message /
// no_active_session / resume_failed / bridge_unavailable(并 transient 同文案) / skill_not_found / editor_not_found）
// ApiOutcome: {ok:false, error: ApiError}（zod outcome error schema 为新增校验面）
// renderer submitDraft 通道: Promise<ApiError | null>；notifySubmitFailure/createFailed → COPY_BY_KIND 查表
// COPY_BY_KIND: Record<HubErrorKind | AppErrorKind, string | ((e)=>string)>——Record 键集即编译期封闭，
// 兜底 unregistered_code = (e) => 原文透传（code+message 不丢，e2e 断言可见）
```

### 2.3 transport 契约（v2 草案的实现级修正）

- `catch` 显式 `return {ok:false, error:{kind:'transient', face:'host_unavailable'}}`。
- **onCall 独立 try/catch 隔离**：观测者抛错只记诊断，绝不影响命令结果；decode 也在隔离段外、
  全函数（任意输入落 unregistered_code，永不抛）。
- 签名**删除可选 timeoutMs**（约定②「调用方不传」的违宪后门）；域方法内定档，
  **四档**：default 30s / prompt 10min / compact 30min / bash 24h。
- onCall 日志策略：**拒绝必落、成功不落**、observer 类命令（monitor 轮询 get_host_info/
  thread/list）豁免——防每天 8.6 万行噪音。
- decode 输入双形状（infra 错误串 ∪ hub {code,message}）；`HostCommandOutcome.error` 类型
  同批改 `string | {code,message}`（contracts/ports.ts）。
- 契约测试钉住以上五条（onCall 抛错不影响结果 / catch 返回形 / decode 全函数 / 前缀归类）。

### 2.4 依赖方向裁决（W3，防 api↔infra 环）

现状：infra→adapter（frame-decoder）；api 空壳已声明 core+infra 依赖。裁决：
- **api deps 只留 contracts**（HostProcessPort 在 contracts/ports.ts，不需要 infra/core）；
- frame-decoder 搬入 api 后 **infra→api** 单向；
- WORKSPACE_MATRIX（oxlint 宪法）同批修：api 行删 infra/core、infra 行 adapter→api，
  锁定测试（no-cross-package-imports.test.ts）与 bun.lock 再生同波；顺带删 testkit 行的
  陈旧 adapter 条目。

### 2.5 跨仓原子交付 runbook（W0+W1）

1. 两工作树**同时改完**，在合并树上跑双侧四门 + 集成门 + e2e:llm 冒烟；
2. **先 commit x-harness，后 commit agent-app**，app 提交信息钉死 x-harness commit hash；
3. 窗口声明：两提交之间（以及任何混合检出）不可用——**断档签名：一切 hub 错误折平为
   `command_failed` = 两侧版本错配**（frame-decoder optString 丢对象 + infra `?? 'command_failed'`
   的静默链）；正在运行的 dev 实例旧 hub 进程存活期不受影响，重启即触雷；
4. 回滚单位 = 两仓**成对 revert**（先 app 后 x-harness）；
5. 原子集必须含**解码链三层 + hub 内部中继层**：contracts hub-protocol.ts ResponseFrame.error、
   adapter frame-decoder.ts optString、infra create-host-process.ts 折叠、x-harness
   worker-frames.ts:96 / worker-control.ts / frames.ts / frame-classify.ts responseLine。

### 2.6 双侧码表对拍

hub `get_host_info` 增加 `errorCodes: HUB_ERROR_CODES` 快照；app 启动期断言
`set equality(contracts 镜像, hub 暴露)`——x-harness 新增码未镜像即启动红（真·双侧封闭）；
集成门逐码抽样旅程断言 kind 解码正确。

## 2c. 外部使用面（修订）

同 v2 三圈结构，修正四点：
- **装配时序**：routes 构造早于 runtime.start——deps.hub 为**惰性 accessor**
  `() => HubApi`（对齐 monitor 现有 host() accessor 形态）；pre-start 请求折叠 transient
  （现状 host_unavailable 降级语义保持）。
- **monitor**：保留 `host()` accessor 作 poll 前置守卫与快照数据源（hostPhase/restarts 来自
  port.diagnostics()，非命令面）；hub 只替换 get_host_info/thread/list 两条命令调用。
- **keepalive 编排留驻 pai-runtime**：register-then-retry 容忍链是域内补偿业务，
  hub.thread.setKeepalive 是单命令薄封装；失败日志保留「host 空窗不告警」语义。
- **子路由组按域窄接口注入**（settings/thread-ops/runtime/resume 各拿所需域接口类型，
  不拿整只 HubApi——窄类型缝不倒退）。
- 自愈归属明写：unknown_thread 重锚在 **renderer**（需 activate/store），协议补偿
  （streaming_window→followUp）在 main——两分有语义依据。

## 2d. 解剖：内部如何定义一个 API、外部如何实现

以真实命令 `thread/set_keepalive` 走完全程（既有命令收编与全新命令定义同构，差异见末尾清单）。

### 内部定义（packages/api，四个文件各一小步）

**① 入参类型——从 contracts 判别联合抽取，零复制**（词表/字段都单一真相在 contracts）：

```ts
// commands/thread.ts
type SetKeepaliveInput = Omit<Extract<PaiCommand, { type: 'thread/set_keepalive' }>, 'type'>;
// = { threadId: string; keepalive: boolean }——hub 协议改字段这里编译红
```

**② 域接口声明 + 实现（一命令一档：超时档在此定，四档之一）**：

```ts
// commands/thread.ts
export interface ThreadCommands {
  // …既有 8 条
  setKeepalive(input: SetKeepaliveInput): Promise<HubResult<null>>;   // 声明
}
export function createThreadCommands(send: Transport): ThreadCommands {
  return {
    // …既有 8 条
    setKeepalive: (input) => send<null>({ type: 'thread/set_keepalive', ...input }, TIMEOUTS.default),
  };   // send = transport 管线：超时→错误分类→onCall，全命令一致
}
```

**③ 门面自动可用**——域对象已挂 `HubApi.thread`，无第四处登记；若命令有非平凡响应，
在 `views/` 放收窄函数并在域方法内应用（外部永远拿视图类型）：

```ts
// 有视图的命令形态（如 get_entries）：
getEntries: (input) => send<RawEntries>('get_entries'…).then(r =>
  r.ok ? { ok: true, data: mapEntries(r.data) } : r),   // 收窄在域方法内完成
```

**④ 同目录单测（scriptHub 剧本注入，无进程）**：

```ts
// commands/__test__/thread.test.ts
const hub = createHubApi({ request: scriptHub({
  'thread/set_keepalive': { ok: false, error: { code: 'unknown_thread', message: 'Unknown threadId' } },
}) });
const r = await hub.thread.setKeepalive({ threadId: 't1', keepalive: true });
expect(r).toEqual({ ok: false, error: { kind: 'unknown_thread' } });   // kind 解码被钉住
```

### 外部实现（三个圈各自的完整形态）

**圈1a · api-routes（三种真实形态——`settle`/`relay` 两原语消灭解包仪式）**：

```ts
// packages/api 导出 settle：HubResult → ApiOutcome 的单点折叠（全仓唯一一处干这事）
export function settle<T>(r: HubResult<T>): ApiOutcome<T> {
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

// 形态① 纯转发路由（无业务）——一行，relay 组合器：params 形状 == hub 入参时直接挂
'session/setKeepalive': relay(hub.thread.setKeepalive),
'session/subagents':    relay(hub.session.subagents),

// 形态② 带业务路由——业务本体不可省，失败出口一行 settle：
'session/start': async (params) => {
  const result = await hub.thread.start(params);
  if (!result.ok) return settle(result);
  const view = runtime.applyStartOutcome(result.data.threadId, …);   // app 业务
  return { ok: true, data: view };
},

// 形态③ 非路由消费（pai-runtime/monitor）——本来就是一行：
await hub.thread.setKeepalive({ threadId, keepalive });
```

relay 放 api-routes 本地（8 行组合器：`(call) => async (p) => settle(await call(p))`，
类型上强制「路由 params 形状 ≡ hub 入参」——不一致就写不成 relay，必须回到形态②显式
映射，错配不可能静默溜过）。§2d 早期示例的逐字段展开是讲解形态，非生产形态。

**两张协议的分层澄清（IPC 面 ≠ hub 面）**：`'session/start'` 是 app 私有 IPC 协议的方法名
（renderer↔main），hub 那头是 `thread/start`——两张词表两次映射，**不合并**。packages/api
收敛 hub 接口知识；app IPC 面（一半纯本地能力 shell/open、git/*，一半带业务）归
contracts（ApiMethod 闭集 + zod 真相）+ api-routes（实现）。剩余的文本重复（方法名同时
出现在 ApiSchemas 与 RouteTable 两张表）用 **defineRoutes 合表**收敛：每方法一处定义、
key 只写一次（`'session/start': method(StartParamsSchema, startSession(deps))`，
纯转发 `hubRelay((h) => h.thread.setKeepalive)`，本地能力同表同校验）；内置两条断言——
① handler keys ≡ ApiSchemas keys 集合相等（登记未实现/实现未登记即测试红，替代现状
运行时 unknown_method 才暴露）；② key 类型绑定 ApiMethod 闭集（拼错编译红）。方法名
全文只余两处且各司其职：renderer 调用点（协议使用方）与 routes 定义点（协议实现方）。

**圈1b · pai-runtime（原直连收编——单命令薄封装 + 编排留驻原地）**：

```ts
// 收编前：let outcome = await host?.request({ type: 'thread/set_keepalive', … });
// 收编后（register-then-retry 补偿链是 app 业务，一行不动地留驻）：
const first = await hub.thread.setKeepalive({ threadId, keepalive });
if (first.ok) return 'ok';
const registered = await hub.thread.register({ sessionPath: row.sessionPath, trusted: … }); // 容忍 already_open
const second = await hub.thread.setKeepalive({ threadId, keepalive });
if (!second.ok) log(`keepalive_hub_apply_failed:${threadId}`);   // 「host 空窗不告警」语义保持
```

**圈2 · renderer（永不触 hub：invoke app 方法 → ApiError kind 查表）**：

```ts
// live-controller.ts（现状 result.error.kind === 'unknown_thread' 自愈等 kind 判定即此形态）
const outcome = await client.invoke('session/setKeepalive', { threadId, keepalive });
if (!outcome.ok) pushNotice(copyOf(outcome.error));    // COPY_BY_KIND 查表（Record 编译封闭）
```

**圈3 · 测试**：单测走 scriptHub（④）；api-routes 级走 fake port 注入（makeProgrammableHost
退役为 request 腿，唯一假面分工见 §4）；集成门真 hub 旅程断言 kind。

### 全新命令定义清单（x-harness 新增 `xxx/yyy` 时两侧共六处，漏改即红）

| # | 仓 | 动作 | 拦截面 |
|---|---|---|---|
| 1 | x-harness | protocol/commands.ts 词表 + handler + 错误发射用 HUB_ERROR_CODES | 词表封闭断言 |
| 2 | app contracts | HUB_COMMAND_TYPES 登记 + PaiCommand 联合成员 | CoversUnion 编译断言 |
| 3 | app packages/api | 域文件一档（①②，必要时 views ③④） | typecheck（Extract 命中即类型就位） |
| 4 | app api-routes | 方法 + zod ApiSchemas 注册 | ApiSchemas 自有属性判定 |
| 5 | app renderer | 消费（若直达 UI） | kind 查表编译封闭 |
| 6 | 双侧 | 集成门旅程 + 码表对拍 | 握手集合相等断言 |

## 3. 波次（v3 重切）

- **W0+W1（原子，跨仓 runbook §2.5）**：x-harness 错误通道结构化（104 站点含四类非机械面 +
  packages 内层穿透 + 中继层）+ 码表握手暴露；app：transport 契约/errors(ApiError 双联合)/
  timeouts 四档/createHubApi + thread 域 + **直连收编所需最小方法集**（thread 域 9 +
  get_state + set_session_name + get_host_info + thread/list——直连 7 处跨域问题由最小集化解）+
  解码链三层 + ApiOutcome 升级 + 自愈改 kind（thread_superseded 防误触发）。
- **W2**：其余域封装 + 10 处正则全退场（含 2 死 matcher 行为修复带回归用例）+ 文案查表
  （Record 编译封闭 + unregistered_code 兜底）+ onPolicySyncFailed 等隐性 reason 通道改形。
- **W3**：adapter 并入 + 依赖翻转（§2.4）+ 帧级 hub_error 与兜底族解耦收尾。
- **W4**：码表对拍断言 + 集成门逐码抽样 + 覆盖率强制机制核实（见 §5）+ 收口。

## 4. 风险与对策（增补版）

v2 表保留，新增：解码链漏改→落地即折平（runbook 第 5 条硬清单）；混合窗口静默失效→断档
签名 + 提交序 + 成对回滚；依赖环→矩阵修宪同波；packages 词表穿透重构→W0 内完成并带单测；
测试断言 ~70 处换形 + renderer fixture ~50 处双面改写→量入 W0/W2 触面如实估工；
makeProgrammableHost 与 scriptHub 裁定**唯一假面**（scriptHub 为 api 包单测面，主/集成门
继续走 fake port，二者职责分工写明）。

## 5. 验证口径（修正）

每波四门 + 集成门；W0+W1 合并树双验。覆盖率：**前置独立项**——app `bunfig.toml` 声明
function 0.9 但实测 81.24 报绿，阈值未被真实强制；W4 收口前必须先核实/修复强制机制
（哪个命令、什么分母），否则「只升不降」无机器背书。此项单独向用户报告。

## 6. 原裁决记录

K1/K2/K3 采纳推荐（v2 定稿）；v3 无翻案。

## 7. 三路审查处置索引

| 级别 | 发现（路） | 处置落点 |
|---|---|---|
| H×9 | 解码链三层+中继层漏（协议路 H1/架构路）；词表四类非机械+缺 4 族（协议路 H2）；ApiOutcome 本地词表（三路撞车）；镜像断言无机制（协议路 H4）；transport catch/onCall（架构路）；transient face 缺 4+1（架构/消费路）；api↔infra 环（架构路）；跨仓原子无机制（架构路）；fork 换轨歧义（消费路） | §2.1–§2.6、§3 |
| M×15 | 死 matcher×2 + 漏记×4（协议/消费路）；码 kind 错位（协议路）；W1 跨域（协议路→最小集）；断言 70 处（协议路）；56→7 映射表（协议路）；HostCommandOutcome 双形状（架构路）；onCall 噪音（架构路）；timeoutMs 后门（架构路）；直连 7 处（架构路）；keepalive 归宿（架构路）；monitor 空窗（架构路）；装配时序（架构路）；覆盖率强制（架构路→§5 前置）；onPolicySyncFailed（消费路）；hub_error 撞名/Record 封闭（消费路） | §0/§2/§2c/§3/§4/§5 |
| L×6 | 断档签名；T39 先例修正（实为 x-harness 加法先行 + app 单提交）；事件面范围声明；cursor_stale 良性扩展钉测；scriptHub 落点；testkit 矩阵陈旧条目 | §1/§2.4/§2.5/§4 |
