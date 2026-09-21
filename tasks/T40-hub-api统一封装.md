# T40：packages/api 统一 host-hub 接口封装（方案 v2 · 已定稿）

> 定稿记录（2026-09-21，用户三轮亲审后确认「最优架构设计，外部好使用，好测试，易于维护，扩展」）：
> - K1 采纳推荐：adapter 并入 packages/api（W3 删包）。
> - K2 采纳推荐：事件面（frame-decoder/event-mapper）同入。
> - K3 采纳推荐：错误封装做协议层（W0 改 x-harness 错误通道为 {code, message}）。
> - 波次粒度：五波。
> - 交付约束修正：**W0 与 W1 必须双侧原子交付**——dev 拓扑下 app 从旁级 x-harness 检出
>   的当前源码 spawn hub，hub 单侧改错误形状会让运行中的 app 立即失去 reason 解析；
>   私有协议无兼容层，两侧一次切换、一次验证（T39 单原子序列先例）。
> - 对抗审查：按用户既定指示（先不跑）跳过子代理审查，用户亲审代位；如实标注。

> v2 要点：按用户两条支柱重排——①错误统一封装推到**协议层**（hub 错误通道结构化，
> 类型安全跨进程到达，app 不再正则猜字符串）；②统一接口调用 = 单一调用约定 +
> transport 管线（超时/分类/观测钩子全命令一致）。

## 0. 现状底账与病灶证据（2026-09-21 盘点）

已有三层收敛（保留不动）：contracts 56 条命令闭集（编译期双向绑定）；渲染层零直连 hub（zod ApiSchemas 注册表单入口）；主进程 `command()` 单点包装（44 处）。

**病灶 A——错误是裸字符串，app 用正则猜**（9 处实证，grep 可核）：

| 消费点 | 现在的字符串匹配 | 用途 |
|---|---|---|
| read-ports | `/unknown command\|unsupported capability\|unknown method/i` | 能力降级缓存 |
| api-routes prompt | `/streamingBehavior required/` | 受理窗口恰一次降级重试 |
| live-controller 自愈 | `reason === 'Unknown threadId'` | 僵尸视图重锚 |
| notifySubmitFailure | `startsWith('invalid images: model does not accept images')`、`startsWith('too many images')` | 友好文案 |
| newTask.createFailed | `/thinking/`、`startsWith('Model not found')`、`/cwd\|directory\|absolute\|exist/i` | 失败指引分派 |
| forkFromEntry | 含 `thread is streaming` | 「先停再分叉」文案 |
| entries 兜底 | `invalid since cursor` | 游标失效全量重拉 |
| resume 收养 | already open 判定 | 表项收养路径 |

hub 侧错误源 ~80 处（30 模板串 + 50 字面串），但**错误族 ≈20**（unknown thread / streaming window / unknown command / capability / invalid input / model unavailable / already open / cursor stale / path forbidden / trust / io / transient…）。

**病灶 B——调用形态不统一**：主进程 6 处直连 `host.request`（keepalive×2、对账 list_saved、队列 get_state、自动标题、monitor 轮询 get_host_info+thread/list）绕过超时档/错误折叠/日志面；日志是我上一批手工逐路由加的（`session_*_rejected`）——每加一条命令就要人记得加日志，这正是没有统一管线的代价。

**病灶 C**——响应收窄散在 adapter 10 文件（消费方 6 文件全在主进程，渲染层零依赖）；`packages/api` 已有空壳（deps 已声明 contracts/core/infra）。

## 1. 目标与非目标

**目标**
1. **错误统一封装（协议级）**：x-harness 错误通道结构化 `error: { code, message }`——code 是闭集词表（x-harness 单一真相，app contracts 镜像 + 封闭断言）；message 保留自然语言细节。app↔hub 是**私有协议、同仓共同部署**（app 从旁级检出 spawn hub），改协议无双轨无兼容（仓库规矩：不写兼容代码）。
2. **统一接口调用**：`packages/api` 单一门面——同一调用约定 `(input) => Promise<HubResult<T>>`，全部经 transport 管线：**超时档 → 错误分类 → 观测钩子**。所有命令自动获得统一日志（替代手工 per-route logging），后续加遥测只动管线一处。
3. 「一个命令的所有知识在一处」：typed 方法 + 入参类型（contracts 判别联合抽取）+ 超时档 + 错误族；收窄映射平移并入（views/）；事件面同入（events/）。

**非目标**：不改渲染层 invoke 面（ApiSchemas/UiEvent 不变）；api-routes 的 app 业务（注册表/信任态/收养/白名单）留驻；不做 56 条全量封装（消费子集 ≈34 条 + 闭集对照断言）。

## 2. 架构（v2）

```
renderer ──IPC/zod── api-routes（app 业务，退薄；错误文案按 kind 分派，删正则）
                        │
                 packages/api ← HubApi 门面
                   ├─ transport.ts   # 唯一 request 持有点 + 管线：超时→错误分类→onCall 观测钩子
                   ├─ errors.ts      # HubErrorCode → HubError 判别联合解码；未登记 code 兜底 hub_error{code,message}（原文不丢）
                   ├─ timeouts.ts    # default/prompt/compact 三档单一真相
                   ├─ commands/      # 七域：thread/session/models/permissions/agents/settings/host
                   ├─ views/         # adapter 收窄映射平移（同目录测试随行）
                   ├─ events/        # frame-decoder + event-mapper + HUB_EVENT_NAMES 消费面
                   └─ index.ts       # createHubApi({ request, onCall? }): HubApi（freeze、零 class、可裸测）
                        │
                 contracts（+镜像 HubErrorCode 闭集与封闭断言）
                        │
                 infra（HostProcessPort——不动）          x-harness（W0：错误通道结构化）
```

**错误封装三层形态**：

```ts
// x-harness protocol/errors.ts（单一真相）——错误族词表，按消费用途定族（≈20 族，不是 80 个）
export const HUB_ERROR_CODES = [
  'unknown_thread', 'streaming_window', 'unknown_command',        // 自愈/降级重试/能力面
  'capability_thinking', 'capability_images', 'images_too_many',  // 能力拒绝（设置指引）
  'invalid_input', 'model_unavailable', 'already_open',           // 表单回填/设置指引/收养
  'cursor_stale', 'path_forbidden', 'trust_required',             // 全量重拉/白名单/信任 UI
  'state_conflict', 'io_failed', 'name_conflict',                 // 其余族
] as const;
// respond(rt, { id, command, error: { code: 'unknown_thread', message: 'Unknown threadId' } })
```

```ts
// packages/api/src/errors.ts —— 解码为判别联合；兜底族保原文（弱形态禁令：不丢信息）
export type HubError =
  | { kind: 'unknown_thread' } | { kind: 'streaming_window' } | { kind: 'unknown_command' }
  | { kind: 'capability'; face: 'thinking' | 'images' } | { kind: 'images_too_many' }
  | { kind: 'invalid_input'; message: string } | { kind: 'model_unavailable'; message: string }
  | { kind: 'already_open' } | { kind: 'cursor_stale' } | { kind: 'path_forbidden' }
  | { kind: 'trust_required' } | { kind: 'state_conflict'; message: string }
  | { kind: 'transient'; face: 'busy' | 'timeout' | 'host_unavailable' | 'host_restarting' | 'host_failed' }
  | { kind: 'hub_error'; code: string; message: string };  // 未登记 code：原文完整透传

export type HubResult<T> = { ok: true; data: T } | { ok: false; error: HubError };
```

**统一调用管线**（transport 单点）：

```ts
export function createTransport(deps: { request: HubTransport['request']; onCall?: CallObserver }) {
  return async <T>(command: PaiCommand, timeoutMs?: number): Promise<HubResult<T>> => {
    try {
      const outcome = await deps.request(command, timeoutMs);
      // 统一观测钩子：全部命令自动落 <command>:<code> 日志（取代手工 session_*_rejected）
      const result = outcome.ok
        ? { ok: true as const, data: outcome.data as T }
        : { ok: false as const, error: decodeHubError(outcome.error) };
      deps.onCall?.(command, result);
      return result;
    } catch { /* 桥异常 → {kind:'transient', face:'host_unavailable'}，onCall 同样可见 */ }
  };
}
```

**消费面改造**（正则全部退场）：

```ts
// 自愈：error.kind === 'unknown_thread' → 重锚重投
// prompt 降级重试：error.kind === 'streaming_window'
// read-ports 能力缓存：error.kind === 'unknown_command'
// 文案分派：kind → zh/en 映射表（capability_thinking → 「渠道设置开思考开关」指引）
```

## 2c. 外部如何统一使用（装配点 + 三圈消费面）

**装配：全进程恰一个 HubApi 实例**。pai-runtime 在 buildHost 时创建（transport 绑定
host port 的 request 面——host 就地 restart 不换 port 对象，hub 实例跨重启稳定存活），
经依赖注入分发；消费方永远不自己 new、不自己拼命令：

```ts
// pai-runtime.ts（装配点，唯一 createHubApi 调用）
const hub = createHubApi({
  request: (cmd, timeoutMs) => host.request(cmd, timeoutMs),
  onCall: (command, result) => log(`hub:${command.type}:${result.ok ? 'ok' : result.error.kind}`),
});
// 暴露：runtime.hub —— index.ts 装配时注入 api-routes(deps.hub) 与 runtime-monitor(deps.hub)
```

**圈1 主进程服务（唯一直接触 hub 的运行面）**——所有消费点同一形态：

```ts
// api-routes：业务留驻，命令调用 + kind 分派
'session/start': async (params) => {
  const result = await hub.thread.start({ cwd: params.cwd, modelId: params.modelId, trusted: params.trusted });
  if (!result.ok) return fail(result.error);            // 统一：error 是 HubError 判别联合
  return { ok: true, data: runtime.applyStartOutcome(...) };  // data 已是收窄视图
},

// pai-runtime（原 6 处直连 host.request 全部换型）：
await hub.thread.setKeepalive({ threadId, keepalive });
const saved = await hub.thread.listSaved({ cwd });       // 已收窄，不再手工解 outcome.data

// runtime-monitor 轮询：
const [info, workers] = await Promise.all([hub.host.info(), hub.thread.list()]);

// 错误处理唯一约定（自愈/重试/降级全部 kind 判定，字面量退场）：
if (!result.ok && result.error.kind === 'unknown_thread') { /* 重锚 */ }
if (!result.ok && result.error.kind === 'streaming_window') { /* followUp 重试 */ }
```

约定四条：① 只写 `hub.<域>.<动词>(input)`，命令字面量（`{type:'thread/start'}`）全仓
仅 packages/api 出现；② 超时档在域方法内定档，调用方不传；③ 不手写命令日志——onCall
管线统一落；④ 期待值恒为 `HubResult<T>`，`!ok` 分支按 `error.kind` 判别联合收窄。

**圈2 渲染层——永不触 hub，但收到同一种错误形状**。app 自己的 IPC 通道同步升级：
`ApiOutcome` 的 `{ok:false, reason:string}` 改为 `{ok:false, error: HubError}`（可序列化
POJO 判别联合，zod ApiSchemas 同步）——否则 UI 文案还是拿字符串猜，类型安全就断在
最后一公里：

```ts
// renderer（notifySubmitFailure / createFailed 的正则分派全部退场，改查表）：
const COPY_BY_KIND: Record<HubErrorKind, string | ((e: HubError) => string)> = {
  capability: (e) => e.face === 'thinking' ? copy.flow.thinkingCapability : copy.flow.imagesDenied,
  transient: () => copy.flow.hostRetryLater,
  /* …每族一条，zh/en 同表 */
};
if (!outcome.ok) pushNotice(copyOf(outcome.error));
```

**圈3 测试——两种统一装置**：

```ts
// 单测（无进程）：剧本注入
const hub = createHubApi({ request: scriptHub({ 'thread/start': { ok: true, data: { threadId: 't1' } } }) });
// 集成门：真 hub + script provider 旅程不变（app 已有装置，仅断言面换 kind）
```

**消费方改造清单（W1/W2 逐项核销）**

| 消费方 | 现状 | 终态 |
|---|---|---|
| api-routes ×6 文件 | `command({type:…})` 44 处 + 手工 fail 日志 | `hub.*` + onCall 自动日志 |
| pai-runtime | 直连 host.request ×6 | `hub.thread.*` / `hub.host.*` |
| runtime-monitor | 直连 ×2 | `hub.host.info()` / `hub.thread.list()` |
| renderer 文案分派 | 正则 ×9 处 | kind 查表（zh/en） |
| ApiOutcome IPC 契约 | reason: string | error: HubError（判别联合贯穿到底） |

## 3. 波次（W0+W1 双侧原子交付；其余每波双侧四门）

- **W0+W1（原子）错误通道结构化 + app 骨架**：x-harness protocol/errors.ts 词表 + respond 全站点 code 化 + 双侧封闭断言；app 侧 transport 管线/errors 解码/timeouts/createHubApi + thread 域 9 条 + **6 处直连收编** + ApiOutcome 升级 `error: HubError` + 自愈/收养改 kind。一次切换一次验证（双侧四门 + 集成门 + e2e:llm 冒烟）。
- **W2（app）五域 + 文案 kind 化**：session/models/permissions/agents/settings 封装切换；**9 处字符串匹配全部退场**（read-ports/prompt 重试/notifySubmitFailure/createFailed/fork/entries 兜底改 kind）；zh/en 错误文案表落 contracts 消费面。收口：grep 正则分派零残留。
- **W3（app）adapter 并入**：views/+events/ 平移（含同目录测试）、消费方改 import、**adapter 包删除**；纯搬移零逻辑变更。
- **W4 收口**：消费子集 vs HUB_COMMAND_TYPES、HubErrorCode 双侧对照断言；覆盖率只升不降；文档。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| W0 触面大（~80 站点） | 纯机械 code 映射 + message 不动；词表先定族再扫站点；x-harness 四门 + 既有 e2e 全量钉行为 |
| 族归错（如 io 误归 invalid_input） | 消费语义反推：每族对应一个 app 行为；W0 审计表逐族列站点，审查子代理对照 |
| 未登记 code 静默折平 | errors.ts 兜底族保留 code+message 原文 + 测试断言兜底路径不丢字 |
| 搬移破窗（W3） | 测试同目录平移；lint/typecheck 拦跨包 __test__ 引用 |
| 行为漂移 | W3 纯搬移；每波 grep 收口断言（直连零残留/正则零残留） |

## 5. 验证口径

每波四门 + 集成门（真 hub script provider）；W0 后跑 e2e:llm 冒烟；W4 全量 + 假绿抽查。
覆盖率：x-harness ≥90/85 只升不降；app funcs ≥81.33 / lines ≥89.10 只升不降。

## 6. 待裁决

1. **K1** adapter 并入 packages/api（推荐）or 保留两包？
2. **K2** 事件面同入（推荐）or 只收命令面？
3. **K3（新增，本方案的根）**：错误封装做在协议层（W0 改 x-harness 错误通道，推荐——类型安全跨进程到达，9 处正则才有根除可言）or 仅在 app 层建字符串分类注册表（不动 hub，弱形态）？
4. 波次粒度：五波（推荐，W0 可独立先合）or 压缩？
