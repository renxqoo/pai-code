# T58 IMPLEMENTATION：relay 迁移施工图

> 状态：**草稿（待用户审阅）**
> 依据：DESIGN（T58-DESIGN-relay迁移设计基线.md）+ 全量审计（B#/D#/C# 见下引）

## 1. 旧实现审计结论（引用）

- **B# 真 bug 16 项**：B1(invoke send 未包 catch)、B2(ack send 穿透)、B3(跨纪元
  seq——LAN 协议根因，relay 的 L2 seq+epoch 域天然解决)、B4(pair 重拨悬挂)、
  B5(重复 pair 签发)、B6(sessionDied 双路由)、B7(每帧重建 Set)、B8(新建会话
  偏好丢失)、B9(图片发送方向缺失)、B10(hydrate 代际互斥)、B11(按名撤销/离线
  不可撤销)、B12(stop→rebuild 竞态)、B13(未鉴权占满连接)、B14(IPC 缺 catch)、
  B15(died/parked 映射不一致)、B16(存储写失败静默)
- **其中 B5/B11/B12/B13/B14 属 LAN 服务端/桌面侧**——随 D12-D15 整体删除，
  不修（删即根治）；B1/B2/B4/B6/B7/B10/B16 属保留代码携带缺陷——**迁移时修**
  并配回归；B3/B9 按挂账与协议替换处理
- **D# 裁决证据**：D1-D9 必须保留（事件归并/历史同步/水化/store/UI 全屏）；
  D10-D15 LAN 专属整体删；D16 死码无条件删；D17 硬编码收口
- **C# 契约缺口 11 项**：C1(epoch——relay L2 天然有)、C2(重连续传语义逐条重建)、
  C3(令牌生命周期→relay 长期钥体系)、C4(配对 UX 重做)、C5(控制面)、
  C6(帧预算→relay chunk 6MiB 段)、C7(TLS→wss)、C8(凭证持久化形态)、
  C9(serverInfo)、C10(公网防线→relay 服务端)、C11(隐藏默认显式化)

## 2. 逐模块裁决表

| 旧文件（agent-app） | 裁决 | 审计状态 | 动作 |
|---|---|---|---|
| mobile/transport/ws-client.ts | **重写** | B1/B2/B4；C2 缺口 | relay 传输新写（RN WebSocket + L3 信封 + ratchet codec 注入 + outbox/ACK/chunk/心跳/退避——语义对照 C2 表逐条）；ws 协议本身删 |
| mobile/transport/client.ts | **复制+微修** | 无缺陷（订阅隔离/形状守卫已验证） | 保留；dispatch 面接 relay 事件泵 |
| mobile/transport/bridge-storage.ts | **复制+微修** | B16（写失败静默） | 保留；存储键改 relay 端点/设备身份形态；写失败可见化回调 |
| mobile/bridge-runtime.ts | **重构** | B6/B7/B10；一文件五件事 | 拆分：relay 装配/事件路由(模块级 Set)/水化/React hook 面分文件；entriesToMessages 与 reconcile 原样迁 |
| mobile/bridge-gate.tsx | **复制+微修** | 无缺陷 | preload 改 relay 端点；连接时序不变 |
| mobile/state/session-sync.ts | **复制+微修** | D1 携带缺陷（messageFinal.toolCalls 未展开） | 保留全套；补 toolCalls 幂等展开 |
| mobile/state/history-sync.ts | **复制+微修** | D16 死码 | 保留主体；删 mergeSaved/setLocalPreference/messagesOf |
| features/*（8 个 UI 屏）+ app/devices.tsx、models.tsx | **复制+微修** | B8/B9 | invoke 调用面零改动；devices 页换 relay 配对 UX；B9 图片发送一期不移植（挂账） |
| store/*（4 个） | **复制** | 无缺陷 | 原样 |
| electron/main/mobile-bridge/（3 文件） | **不移植** | D12 | 整体删除（relay 链路无桌面 WS 服务） |
| contracts/mobile-bridge.ts | **不移植** | D14 | 整体删除（线格式真相移至 x-harness WIRE.md） |
| preload mobile 面 | **不移植** | D15 | 删除 |
| settings/devices-section + use-mobile-bridge-panel | **重构** | B14；C5 | 删配对码卡；保留开关/状态骨架挂 relay 控制面（本期最小：只删不建，控制面挂账） |
| **新增** mobile/relay/（协议栈） | **新建** | — | @noble crypto fork + 协议子集 + RN 传输 + MMKV persist + 配对旅程 |

### x-harness 协议包消费方式（DESIGN §3.2 候选 A 落地）

`packages/relay-protocol/`（agent-app 内新包）：从 x-harness remote-protocol
**复制**纯协议子集（frames/envelope/vocab/limits/ratchet/pake/pairing/rekey/
chunk/reliable/inbound-stream/outbox/hex），crypto.ts 重写为 noble 实现
（对外签名/线格式零变化）；`packages/relay-protocol/__test__/wire-parity.test.ts`
对拍 x-harness WIRE.md 固定向量（RFC 7748/8032）钉协议等价。

## 3. 拆分决策

- 新包 `packages/relay-protocol`（协议，零 RN 依赖——node 侧测试可跑）
- `apps/mobile/src/mobile/relay/`（RN 传输 + 配对 + 持久化装配）
- bridge-runtime 拆四文件（§2 表）；MobileBridgeState 类型独立 types 文件（依赖方向修复）
- 删除后 settings 分区 nav 的 devices 项保留（面板骨架在，配对 UX 换 relay 形态）

## 4. 测试计划

- **规格基线**（审计四清单）：保留 49 例移动端既有用例随迁；删 18 例 ws 协议用例；
  桌面 17 例全删、4 组语义在 relay 服务端测试重立（x-harness 已有 e2e 覆盖）
- **wire-parity**：noble fork vs x-harness 原实现固定向量对拍（X25519/Ed25519/
  AES-GCM/HKDF/PAKE 全套往返）——**每向量双实现输出必须逐字节相等**
- **回归新增**（审计 §四迁移必须补的 7 项）：B6 恰收敛一次、toolCalls 无前驱
  不丢、重连纪元、B8 偏好落账、B11→relay 设备 id 撤销、B1/B2 发送失败收敛、
  chunk 重组真 socket
- e2e：真 relay 进程 + 真 gateway + fake host（kit 复用 x-harness e2e 装置形态）
  ——配对/对话/断线重连/撤销四旅程

## 5. 实施顺序（阶段门）

1. **P0 试运行**（流程 §6 最小单元）：relay-protocol 包骨架 + noble crypto +
   wire-parity 对拍全绿——验证「流程本身」（最大技术风险前置）
2. **P1 协议子集迁移**：复制纯协议文件 + hex Uint8Array 化 + 测试随迁 → 四门
3. **P2 RN 传输**：relay transport（复刻 C2 语义表）+ storage 改造 + bridge-runtime 拆分 → 四门 + B1/B2/B4/B6/B7/B10/B16 回归
4. **P3 配对旅程 + devices 页**：PAKE/QR 手输码 UX + 设备身份持久化 → 四门
5. **P4 删除 LAN**：electron mobile-bridge/preload/contracts 面/settings 配对码卡
   + 死码 D16/D17 清理 → 四门 + 移动端既有保留用例全绿
6. **P5 e2e + 收口**：四旅程 e2e + 对抗审查 + 核销

每阶段独立提交引用本文档节号。
