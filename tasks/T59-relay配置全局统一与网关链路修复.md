# T59 relay 配置全局统一与网关链路修复 方案

> 状态：定稿
> 级别：中（跨 contracts / electron main / renderer / 打包脚本 + 跨仓 x-harness）
> 症状：设置 → 设备与连接 →「发起配对」报 `bad pairing response`

## 0. 症状与根因

### 0.1 症状
`bad pairing response` 是渲染层兜底文案，真实原因被吞掉。三层缺陷叠加：

**A. 渲染层吞因**（`devices-section.tsx:99-108`）：IPC 层（`index.ts:434-436`）对任何
gateway 应答都回 `{ ok: true, body }`，`result.ok` 恒真；随后只校验 `body.pairingId /
body.qrPayload` 形状——网关任何失败（`{ success: false, error }`）都命中形状检查，
统一替换成硬编码英文 `bad pairing response`（违反「用户可见文案只写 strings/」）。

**B. 网关入口解析缺链**（`index.ts:431` + `gateway-process.ts:67-78`）：入口唯一来源是
`process.env.X3CODE_X_HARNESS_ROOT`（无任何设置面写入、无打包产物），拿不到即退化成 stub，
命令一律 `{ success: false, error: 'gateway not configured' }`（日志 `gateway_entry_missing`）。
`resolveHubPathsForRuntime` 的宿主链路（设置 > env > dev 旁级 > 打包资源）**未覆盖 gateway**。

**C. relay 配置从未装配**：`agentDir/gateway.json` 全仓无写者；`gateway-process.ts:30` 声明
`gatewayConfig` 依赖后从未使用（死参数）。配置为空 ⇒ gateway 以 `remoteEnabled:false` 起，
`pairing/start` 必失败（qr：`relayKeyFingerprint required for QR pairing`；manual：
`pairing ticket unavailable`）。

**D. x-harness 侧抛穿进程**：`pairing-server.startQr/startManual` 对失败 `throw`，
`gw-dispatch.ts:91` 与 `owner-dispatch.ts:32` 均无 try/catch ⇒ 未捕获 rejection 直接杀死
gateway 子进程（`main.log` 再无 `gateway_owner_connected`），桌面 UI 只能等到 10s 超时。

## 1. 用户裁决（2026-09-29）

- **relay 配置不做独立配置**：不进 `gateway.json` 手编，改为**全局统一**——relay 参数是
  `settings.json` 的一项（`relay`），`agentDir/gateway.json` 降为**派生落盘产物**。
- **照其他配置的做法**：与 `providers` → `providers.json`、hub 权限档 → `hub-settings.json`
  同形——设置面唯一真相在 `settings.json`，hub/gateway 侧文件在 spawn 时重生成
  （`writeModelsConfig` 同款：原子写 tmp+rename，每次 spawn 重生成）。

## 2. 契约

### 2.1 全局设置新增项（`packages/contracts/src/settings.ts`）

```ts
export const RelayConfigSchema = z.object({
  /** relay WSS 基址；空串 = 未配置（网关停留本地形态，配对不可用）。 */
  relayUrl: z.string().default(""),
  /** relay 长期身份签名指纹（wss 形态校验用；空串交由 x-harness 拒启）。 */
  relayKeyFingerprint: z.string().default(""),
}).strict();
// SettingsSchema 增：relay: RelayConfigSchema.default({ relayUrl: "", relayKeyFingerprint: "" })
```

- `parseSettings` 宽容读：盘上无 `relay` 键 → 落缺省（老 settings.json 不整档降级）。
- **`remoteEnabled` 不是独立开关**：`relayUrl` 非空即远程形态，空即本地形态——同一事实
  只表达一次，杜绝「开关开了但没填地址」的二义态。

### 2.2 派生产物 `agentDir/gateway.json`（x-harness 读口形状，本仓零自创）

```ts
export function serializeGatewayConfig(relay: RelayConfig): string
// → {"remoteEnabled": relayUrl.length > 0, "relayUrl": ..., "relayKeyFingerprint": ...}
```
纯函数（契约层，与 `serializeProvidersConfig` 同层），键序固定，末尾换行。

### 2.3 偏好视图（`packages/contracts/src/api.ts`）

`PreferencesViewSchema` 增 `relay: RelayConfigSchema`；`app/setPreference` 参数增
`relay?: RelayConfigSchema`（可选，缺省不改）。改 relay 的副作用与 `provider/upsert`
同形：**重启 gateway 进程**（gateway.json 只在 gateway 启动期读入）。

### 2.4 gateway 入口解析链（`apps/electron/src/main/hub-paths.ts`）

与宿主同链同序，新增 gateway 条目候选（`resolveGatewayEntry`）：

1. `settings.hubDev.gatewayEntry`（开发者显式覆盖）
2. `X3CODE_GATEWAY_ENTRY` 环境变量
3. dev 旁级探测 `../x-harness/apps/hub-gateway/src/cli.ts`（打包态跳过）
4. 打包资源 `resources/hub-gateway/dist/cli.js`

### 2.5 gateway 命令应答契约（不变，但渲染层必须读）

owner 命令应答 `body` = `{ success: true, data } | { success: false, error }`（x-harness
`owner-dispatch.ts:33` 既定形状）。渲染层以 `body.success === false` → 展示 `error`。

## 3. 问题域

**处理**
1. contracts：`RelayConfigSchema` + `serializeGatewayConfig`（纯函数）。
2. electron main：gateway 入口解析链；`writeGatewayConfig`（派生落盘）；`gateway-process`
   去死参数、入口可注入、socket 断开/子进程退出即拒挂起命令。
3. renderer：`devices-section` 读 `success/error`、展示原始原因；新增 relay 配置表单
   （地址 + 指纹 + 保存）；未配置时显引导（配对钮保留，网关回真实原因可诊断）。
4. strings：全部新增文案入 `zh-settings.ts` / `en-settings.ts`。
5. packaging：`sync-resources.ts` 增 gateway 资源同步——**bundled 单文件**
   （`resources/hub-gateway/dist/cli.js`，不带 `--external`；网关不装插件，依赖整体入产物，
   不引第二份 node_modules 闭包——host-hub 那边必须留 dist + 闭包）。
6. x-harness：`makeGwDispatcher` 返回**总函数**（命令边界一层 try/catch 把所有 throw 收成
   `{ ok: false, reason }`，覆盖现役与后续 gw 命令）——配对失败不再杀死 gateway 进程
   （跨仓，独立提交）。

**不处理**
- relay 服务端部署运维 → x-harness `apps/hub-relay/README.md`（既定挂账）。
- gateway OS 服务安装器 → x-harness 后续任务（T58 §6 挂账）。
- 手机侧 relay 配置：relay 端点经 QR 载荷下发，手机不重复配置（全局统一的一部分）。
- `relayKeyFingerprint` 的可视化录入体验（粘贴文本框即可；证书指纹扫描非本期）。

## 4. 并发/一致性预算

- `writeGatewayConfig` 原子写（tmp + rename），失败不阻断 spawn（与 providers.json 同）；
- gateway 重启：`stop()` 有 3s SIGTERM→SIGKILL 兜底（既有实现），重启期间命令返回
  `gateway not connected`，渲染层展示该原因而非假绿；
- 命令等待：socket 断/子进程退 → **立即** reject 全部 pending（不再空等 10s 超时）。

## 5. 实施顺序

| 阶段 | 内容 | 验收点 |
|---|---|---|
| M1 | contracts：schema + 序列化（TDD 先红） | `packages/contracts` 单测绿 + 四门 |
| M2 | hub-paths 扩 gateway 候选 + `gateway-config.ts` 落盘（TDD） | main 单测绿 + 四门 |
| M3 | gateway-process 去死参数/入口注入/断连即拒（TDD） | main 单测绿 + 四门 |
| M4 | api/contracts 偏好面 + index.ts 装配 + 重启副作用 | api 单测绿 + 四门 |
| M5 | renderer 错误透传 + relay 表单 + strings（TDD） | 渲染层单测绿 + 四门 + bw 真机走查 |
| M6 | sync-resources gateway 资源（bundled 单文件） | 脚本单测绿 + 真构建产物起网关应答 |
| M7 | x-harness 命令边界总函数（跨仓独立提交） | x-harness 单测绿 |

收口态：`gateway.json` 每 spawn 由 `settings.relay` 重生成，手编值必被覆盖——单轨达成。

## 6. 测试口径

**契约级（contracts）**
- `relay` 缺省：无键 settings 解析出 `{ relayUrl: "", relayKeyFingerprint: "" }`；
- `serializeGatewayConfig`：空 relayUrl → `remoteEnabled:false`；非空 → `true` 且三键齐全；
- 键序/末尾换行稳定（重生成不产生伪 diff，避免无谓重启）。

**边界**
- 只填 URL 不填指纹（wss）→ 序列化保留空指纹（由 x-harness 拒启并回原因）；
- `relay` 为垃圾形状（字符串/数组）→ 整档降级缺省不崩；
- gateway 入口候选全缺 → `null`（面板显示引导，命令返回 `gateway not configured`）；
- socket 断开时挂起命令 → 立即 `{ success:false, error:'gateway not connected' }`。

**渲染层**
- `body.success === false` → 展示 `body.error` 原文；IPC 层 `ok:false` → 展示 `reason`；
  `success:true` 但缺配对字段 → 展示 `settings.pairBadResponse`（回归用例名注明症状）；
- 状态/设备列表读 `body.data`（网关 response 包裹），设备列表是行数组——读顶层即面板恒空；
- relay 未配置 → 配对卡显 `relayNotConfigured` 引导（配对钮保留）；
- relay 表单：草稿取自偏好面，保存回传完整配置；
- **装置纪律**：本文件只挂 `window.x3code`，不替换 `globalThis.window`（旧装置覆盖后把其后
  所有 DOM 测试打红——渲染层套件 77 红 → 1 红）；
- 受控 `onChange` 在 bun + happy-dom 下派发 input 不触发（实测矩阵全红、仓库无先例），
  键入路径由 bw 真机走查覆盖。

**e2e（x-harness `__test__/gw-pairing-failure.test.ts`）**
- 无 relay 指纹的网关：`gw/pairing/start` 回 `{success:false,error}`，随后 `gw/status` 仍应答
  （旧实现：未捕获 rejection 穿出进程，配对后再无应答）。

## 7. 验收清单

- [x] `settings.json` 是 relay 配置唯一真相；`gateway.json` 为派生产物，无手编路径
- [x] `X3CODE_X_HARNESS_ROOT` 不再是 gateway 入口唯一来源（设置/env/dev/打包四段链）
- [x] 渲染层不再出现硬编码英文兜底；全部文案在 strings 目录
- [x] 网关失败时 UI 展示可诊断原因，且不再出现「点击无反应等 10s」（断连/退子进程即拒挂起）
- [x] 配对失败不再杀死 gateway 进程（x-harness 命令边界总函数）
- [x] bw 真机走查（隔离数据区 + 真 Electron + 真 gateway）：设置→设备与连接导航可达、
      relay 键入保存落 `settings.json`（网关重启 + 「已保存」提示 + 引导消失）、发起配对
      2s 内显示 `pairing ticket unavailable (relay enroll pending?)`、无 `bad pairing response`、
      网关仍在线、设备列表渲染（截图 `/tmp/x3code-devices-walk.png`）
- [ ] 四门全绿 + 覆盖率数字如实报告；无 skip/删断言（**他人在途未清，见 §8**）

## 8. 门禁归属（2026-09-29）

本任务改动文件的 lint/typecheck/单测全绿；仓库整体尚有他人在途变更未清：

| 门 | 残留 | 归属 |
|---|---|---|
| lint | 14 errors（`worktree-notice.ts` + 其测试 `require-await`） | worktree 通知在途改动 |
| test | 1 fail（`UI 事件词表与 schema 判别值一致`） | `ui-events.ts` 新增 `worktreeNotice` 未同步词表 |
| x-harness test | 1 fail（`base-prompt` 任务清单配合句）+ 并行负载 flake | x-harness HEAD 基线 |

x-harness 四门：lint / typecheck / build 绿；本任务的 `gw-pairing-failure` e2e 绿。
