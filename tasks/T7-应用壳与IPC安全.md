# T7 · 应用壳与 IPC 安全（api 服务 / handlers / Electron 加固 / 生命周期） 方案

> 状态：草稿（待评审定稿）｜ 级别：中 ｜ 波次：2 ｜ 依赖：T0；联调 T2（装配 RuntimeConfig）、T4（core）、T5（StorePort）、T6（桥） ｜ 被依赖：T8（真 Client 联调）、T9（加固进发版检查）
> 方案依据：方案第 4 章加固、第 10 章与第 2.1 节

## 契约

```text
两部分交付：
A. packages/api —— AgentService（transport 无关）：apiInvoke(method, params) 校验链（zod + 资源归属）
   + UiEvent 总线（订阅/快照 getStateSnapshot）；命令面 = 第 10 章 agentApi 全集
B. apps/electron ——
   preload/IPC 绑定（sender 校验 + 参数透传 + 事件单播）
   装配（组合根）：RuntimeConfig{bunPath, hubEntry, agentDir} + 哈希清单校验 + env 白名单重建
     + scrubProviderKeys + PI_CODING_AGENT_DIR + PI_SKIP_VERSION_CHECK
   加固：Fuses（RunAsNode=off 等）/ app:// 协议 + CSP / 窗口策略 / asar 完整性 / 产物哈希
   生命周期：before-quit → hub 优雅停（stdin EOF 路径）→ quit；托盘驻留 + 退出确认；powerSaveBlocker；单实例锁
   网络模块：代理（keychain）/根证书/offline 检测/stderr 特征识别
   auth 通道：auth/list、set_api_key、remove_key 的 handler（key 零回显/零落盘断言）
```

- 错误形态：校验失败统一 `forbidden|invalid_params|unknown_resource`（中性英文，renderer 映射文案）。

## 问题域

- 处理：api 服务与校验；preload/handlers；hub spawn 装配与完整性校验；Electron 加固全表；生命周期/托盘/防休眠/单实例；网络模块与 stderr 识别；通知；auth 通道。
- 不处理：业务逻辑（core/infra）；对话框渲染（T8）；hub 协议（T1）；打包产物生成（T9，本任务定义 resources 布局契约）。

## 并发/一致性预算

- handler 内禁长 IO（全走 Port 异步）；启动分级：窗口骨架屏 → SQLite → spawn hub（异步）→ 产物哈希/网络/认证探测并行；产物哈希校验 ≤500ms 异步不挡首帧；单实例第二实例 → 聚焦主窗口。

## 拆分

```
packages/api/{service.ts, guards.ts, __test__/}
apps/electron/src/main/{preload.ts, ipc.ts, runtime-config.ts, fuses.ts, protocol-app.ts,
  lifecycle.ts, tray.ts, net-module.ts, __test__/}
```

## 实施顺序（每步独立测试 + 四门全绿后提交）

| # | 内容 | 单测 | 验收 |
| --- | --- | --- | --- |
| M1 | AgentService + 校验链 | 越权矩阵（主体 × 资源 × 全 API）；zod 参数表；Port 转发断言 | api 面 == contracts schema |
| M2 | Electron 装配：preload/handlers/RuntimeConfig | RuntimeConfig 组装断言（env 白名单 + scrub 清单逐项 + PI_* 注入）；哈希校验两形态 | 真 hub spawn 冒烟（dev 路径） |
| M3 | 加固：Fuses/CSP/app:// /窗口策略 | Fuses 配置快照；CSP prod 无 localhost/dev 放行存在且不进 prod 构建（构建产物断言）；协议 handler 单测 | 第 8 章对应项可勾 |
| M4 | 生命周期 + 托盘 + powerSaveBlocker + 单实例 | 状态机表驱动：有/无任务 × before-quit/window-all-closed；第二实例聚焦 | 优雅停链（stdin EOF）真机通过 |
| M5 | 网络模块 + auth 通道 + 通知 | stderr 特征识别表（证书/401/ENOSPC/离线）；auth handler key 零回显断言；通知降级 | 手动冒烟归 T9 发版门 |

## 裁决

- CSP 经 app:// 协议头下发：既有默认裁决。
- RunAsNode Fuse 关闭（hub 由 bun 运行）：架构红利，直接落地。

## 测试口径

- 契约断言：agentApi 成员封闭（类型 + keys 快照，与 contracts schema 双向相等）；三种错误 message 穷举。
- **越权矩阵（M1 强制）**：主体（主窗口/子窗口/iframe/第二实例）× 资源（他人 threadId/未登记 workspaceDir/设置项）× 操作（全 API）遍历。
- 边界：sender 校验时主窗口已销毁；zod 边界两侧；离线 auth 超时；哈希不匹配拒启。
- 分层：单元（全 mock）+ 组装级（真 preload + 内存 Port，与 T8 契约套共用）；e2e 归 T9。

## 未决项

| 项 | 阻塞 | 处理 |
| --- | --- | --- |
| EDR 兼容清单执行 | M5 冒烟 | 归 T9 Spike 5 |

## 验收清单

- [ ] 外部契约逐条（api 面封闭 + 生命周期行为 + 装配契约）
- [ ] 越权矩阵全维通过
- [ ] 边界清单逐条；Fuses/CSP 快照锁定
- [ ] 四门 + 覆盖率数字
- [ ] 对抗审查：M1 guards + M2 装配 + M3 加固批次（安全面必审）
