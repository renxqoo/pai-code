# T8 · 渲染层 UI（对 mock Client 开发，波次 1） 方案

> 状态：草稿（待评审定稿）｜ 级别：中 ｜ 波次：**1**（T0 交付 mock Client 后立即开工，波次 2 末切真 Client 联调） ｜ 依赖：T0；联调 T7 ｜ 被依赖：T7（契约互证）、T9（E2E 载体）
> 方案依据：方案第 7、10 章与第 16 章渲染栈

## 契约

- 消费面：仅 `Client` 接口（T0），零 Electron 逻辑（preload/平台判断一律注入实现；capabilities 协商替代 `if (isElectron)`）。
- 对外产物：store 两层状态机迁移表（thread 级/turn 级，每个 UiEvent → 唯一目标状态，一次性事件恰消费一次）；可见性上报时机；重水化必经 `getStateSnapshot()`。
- 文案全部走 strings 模块；错误 message 中性英文 → 文案目录映射。

## 问题域

- 处理：对话管理（tabs/新建/关闭/驻留提示）；thread 卡片与流式渲染（transient+rAF/虚拟滚动/thinking 折叠/展开全部→协议 get_messages）；两层状态机与全部状态卡（queued 位置/对话框等待/崩溃重启中/interrupted/恢复）；**对话框族**（confirm/select/input/editor/notify/setStatus，含倒计时与「已自动拒绝」展示）；设置页（预算/权限规则编辑器——经协议提交，预览为纯展示并标注「以 hub 判定为准」/API key 管理（auth list/set/remove，key 零回显）/trusted 项目审批）；重水化；导出与诊断 UI。
- 不处理：IPC 与校验（T7）；调度与恢复（T4）；规则判定（hub/T6 语义层）；mock 本体（T0）。

## 并发/一致性预算（性能验收线）

- 单卡 re-render ≤ 帧间隔（chunk 不进 React state；turn 结束才并入消息列表）；精确订阅 + copy-on-write + useShallow；虚拟滚动 >500 条分页；不可见对话事件由主进程降级。

## 拆分

```
packages/ui/src/{app/, conversations/, thread-card/, streaming/, dialogs/, settings/, auth/,
  store/, strings/, <各模块>/__test__/}
```

## 实施顺序（每步独立测试 + 四门全绿后提交）

| # | 内容 | 单测 | 验收 |
| --- | --- | --- | --- |
| M1 | 布局 + 对话管理 | RTL：新建/切换/关闭（keepRunning 两分支）/可见性上报时机 | mock 全通 |
| M2 | store 两层状态机（纯逻辑先行） | 迁移表驱动：全部 UiEvent × 初始态穷举（含 dialog_request 族）；一次性事件恰一次；快照合并；seq 乱序容错 | 表 100% 绿后组件动工 |
| M3 | thread 卡片 + 流式渲染 | 回放夹具：chunk 直写零 re-render（计数断言）；thinking 折叠；展开全部；虚拟滚动 1000 条 | 性能断言过 |
| M4 | 状态卡 + 对话框族 | RTL 每状态卡与六方法对话框；倒计时与超时结果；双击幂等；法务文案逐字断言（strings key） | 状态机全覆盖 |
| M5 | 设置页：权限规则编辑器（协议）+ API key + trusted | RTL：rules 透传往返/纯展示预览；key 输入零回显；trusted 审批流 | mock 全链路可用 |
| M6 | 切真 Client 联调 | 复用 M1–M5 全部测试仅换注入 | 真 IPC 下同一测试套全绿 |

## 裁决

- **UI 基座**（用户裁决）：shadcn `init --preset b0 --template vite`（base-nova 线）已在 apps/electron 移植落地——components.json 指向 renderer 路径、主题 CSS + 显式 @source、`cn` 包（弃 clsx/tailwind-merge）、lucide/tw-animate/Inter 字体；后续组件用 `bunx shadcn add <name>` 在 apps/electron 下安装，落在 `src/renderer/src/components/ui/`。
- 流式正文 transient + rAF：既有裁决。
- capabilities 协商替代平台判断：架构硬规则（总览）。

## 测试口径

- 契约断言：状态机迁移表穷举；可见性/重水化时机；对话框 payload 形态 ↔ 组件渲染映射表。
- 边界：空对话/空态/超长消息/未闭合代码块/seq 跳号/晚订阅（刷新后恢复中）/回放器调速与停止。
- 表驱动：UiEvent×状态矩阵、状态卡表、对话框方法表、文案 key 表。
- 分层：单元（store 纯逻辑 + RTL/happy-dom）+ 性能断言（re-render 计数）；E2E 载体规范（data-testid）。

## 未决项

无（认证仅 API key，无 OAuth UI）。

## 验收清单

- [ ] 外部契约逐条（仅 Client 依赖/迁移表/上报与重水化时机）
- [ ] 边界清单逐条；性能预算逐条
- [ ] 四门 + 覆盖率（store 与组件分别报告）
- [ ] 对抗审查：M2 状态机批次
