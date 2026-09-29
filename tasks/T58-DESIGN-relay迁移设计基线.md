# T58 DESIGN：移动端接入 relay 链路（删 LAN bridge）设计基线

> 状态：**草稿（待用户审阅——用户已裁决：文档先过目再进对抗审查）**
> 级别：大（跨仓协议依赖 + 移动端传输层重写 + 桌面端 LAN bridge 全删 + 双端配对 UX 重做）
> 关联：x-harness 已合入 main（`abfbcdb`）——remote-protocol / hub-relay / hub-gateway / remote-client 为服务端真相

## 0. 背景与裁决

**用户裁决（2026-09-29）**：删除 agent-app 现有「仅同局域网」方案，手机 App 接入
`手机 → 自建 relay（公网） → hub-gateway 守护进程 → host` 链路。x-harness 的
feat/remote-access 先合入 main（已完成）。

**中途接入声明**：agent-app 已有 LAN bridge 实现无迁移文档。按 repo-migration-e2e-v2
流程 §0，已对既有代码回补全量审计（B1-B16 / D1-D17 / C1-C11，见 IMPLEMENTATION 引用），
本三件文档是回补后的正式基线。

## 1. 外部契约

### 1.1 线格式（全部继承 x-harness remote-protocol，本仓零自创）

- **L1 加密套件**：`x25519-ed25519-aes256gcm-hkdf-sha256-v1`（remote-protocol/crypto.ts）
- **L2 信封/可靠性**：`{v, from, to, payload, nonce}` 信封 + seq/ACK + chunk 分片（6MiB 段）
  + outbox 重发 + 双 ratchet 前向保密 + 强制 rekey（2000 帧/24h）
- **L3 地址域**：`dev_<deviceId>` / `gw_<installationId>` / `pairing_<pairingId>`
- **配对协议**：QR（`{relayUrl, pairingId, gatewayEphemeralPub}`）+ 手输码 PAKE
  （8 位 ABCD-EFGH 形态码 + SAS 6 位目视比对）；设备长期钥 Ed25519 签名 + X25519 加密对
- **真柜契约**：x-harness `docs/WIRE.md` 是线格式唯一真相；本仓 mobile 引用
  `@x-harness/remote-protocol` 源码（workspace 外跨仓——见 §3.2 依赖策略）

### 1.2 移动端 API 消费面（保持现状，UI 零改动）

UI 层继续经 `Client` 接口（`invoke(method, params)` / `subscribe(onEvent)`）消费
60+ ApiSchemas——relay 链路只替换传输实现，`invoke` 帧走 L2 `command`、事件走
扇出帧（gateway 把 host 的 UiEvent 加密投递到 `dev_<id>`）。

### 1.3 事件时序契约（继承 LAN 阶段已验证的语义）

- `messageFinal` 权威终局替换流式缓冲；`turnSettled` 后 entries 对账（PC 语义）
- 事件只并入 `activeThreadId` 匹配的会话（null 通配已收窄——B6 双路由修复后唯一路径）
- 断线重连：gateway 双端收同一扇出 + `(deviceId,commandId)` 幂等 + 客户端
  outbox 重发 + `get_entries{since}` 游标水化兜底

## 2. 内部问题域

### 处理什么（移动端）
1. **relay 客户端传输**：WS 连 relay、L3 信封收发、ratchet seal/open、outbox/ACK、
   chunk 重组、心跳/退避重连（继承 ws-client 已修的 H1/H2/H4/M1/M5 语义——对照
   C2 缺口表逐条重建）
2. **配对旅程（手机侧）**：扫码/手输码 → PAKE/SAS → 长期钥落 SecureStore →
   ratchet 种子建立
3. **凭证持久化**：deviceId + 设备长期钥 + ratchet 边界（MMKV）+ relay 端点（AsyncStorage）
4. 既有事件归并/历史同步/水化全部保留（D1-D9）

### 明确不处理什么（归属）
- **relay 服务端部署运维**（双实例/LB/TLS 证书）→ x-harness `apps/hub-relay/README.md`
- **gateway 守护进程生命周期**（OS 服务自启/安装器）→ x-harness（挂账项，见 §6）
- **推送通道**（FCM/APNs）→ 一期不做，协议钩子由 x-harness 提供
- **桌面 App UI 的 relay 控制面**（网关状态/设备管理界面）→ 本期只删 LAN 面板
  （devices-section 配对码卡），relay 控制面新 UI 归后续任务（见 §6 挂账）

### 3.2 依赖策略（方向性裁决，需用户确认）

**候选 A（推荐）**：把 `@x-harness/remote-protocol` 以 git submodule / 复制子集
方式引入 agent-app，crypto.ts 在仓内 fork 为 noble 实现（同一对外签名）。
- 优点：单仓可测、Hermes 适配自由；缺点：协议升级需手动同步（以 WIRE.md 对拍测试钉住）

**候选 B**：npm 私有包发布 @x-harness/remote-protocol（node + rn 双入口）。
- 优点：单一真相；缺点：需要发布基建，且 RN 入口仍需在 x-harness 仓内开发——
  跨仓改动摩擦大

**候选 C**：不引包，agent-app 内按 WIRE.md 独立重写 RN 侧协议栈。
- 违背「同一事实一套实现」，不推荐，列出仅为完整

## 3. 并发与性能预算

- 每帧 seal/open ≤1ms（noble 纯 JS 在 Hermes 的量级预算，试运行实测校准）
- ratchet 边界持久化：MMKV 同步写 ≤5ms；**批首落盘成功才放行发送**（ratchet.ts 语义）
- 事件扇出高峰（流式 delta）：每帧处理（解密+归并+store 更新）≤4ms
- 全局定时器：心跳 1 + rekey sweep 1（gateway 侧）+ 退避 1——客户端恒 ≤3
- 加密栈体积预算：tree-shaken ≤150KB min（勘察实测推算 90-130KB，余量 15%）
- 热路径禁止：JSON.parse 前不验尺寸上限就解 base64；每事件重建 Set（B7 教训）

## 4. 关键技术事实（勘察证据，设计依据）

1. **Hermes 无 node:crypto 等价物**——X25519 KeyObject/DER、AES-GCM、Ed25519、
   同步 HKDF 全缺；@noble 三包 100% 覆盖，DER 是可删实现细节（WIRE §4 已钉）
2. **Buffer 74 处/12 文件**——全部在 feross buffer polyfill 支持面内；根治方案
   （自有 Uint8Array helper）留作优化波，一期 polyfill
3. **RN WebSocket 原生分帧**——remote-client 的 ws-frame-reader/writer 与手写
   握手 RN 侧不需要；connect.ts 上层逻辑（ingest/codec/outbox/ACK/chunk）全保留
4. **ratchet 持久化已注入式**——参考实现是空桩，RN 必须注入 MMKV 真实现
   （否则崩溃恢复后 nonce 复用——A1 级缺陷）
5. **配对协议 RN 可跑**——QR/PAKE 全依赖 crypto.ts 原语，noble 替换后直接可用

## 5. 安全基线（继承 x-harness DESIGN 8 条硬条款）

LAN 阶段的 6 项已修缺陷语义（撤销即时失效、资源防线、原因泛化等）在 relay 链路
由协议层天然提供（E2E 加密/公网暴露防线在 relay 服务端）；移动端侧保留：
- 凭证只在 SecureStore/MMKV，明文不落 AsyncStorage
- 配对失败原因泛化（LAN 已修语义，relay 的 pairFailed 同构）
- 未鉴权资源防线（relay 服务端职责，客户端不假设）

## 6. 显式挂账（不处理清单的后果与归属）

| 挂账 | 后果 | 归属 |
|---|---|---|
| gateway OS 服务安装器 | 用户需手动启动 gateway 守护进程 | x-harness 后续任务 |
| 桌面 relay 控制面 UI | 删 LAN 面板后桌面暂无设备管理界面 | agent-app 后续任务（relay 状态经 gateway owner 通道可做） |
| WebRTC P2P 直连优化 | 延迟高于直连 | x-harness DESIGN §6 既定挂账 |
| Buffer→Uint8Array 根治 | 依赖 polyfill | agent-app 优化波 |
| B9 图片发送方向 | 一期移动端不发图（可收图）| 本 MIGRATION 波 2 显式不移植，挂账 B9 |
