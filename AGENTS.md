# AGENTS.md — Pai（Electron + pi-hub 多 Agent 桌面应用）

**pai**：monorepo（bun workspaces，scope `@paiapp/*`）。Electron 应用通过**单个 pi-hub 宿主进程**（独立仓库 `/Users/wrr/work/pi/app`，bun 运行）承载多对话 × 多 thread 的 AI Agent：hub 进程内用 pi SDK 跑 AgentSession，Pai 与它的全部交互只有 JSONL stdio 协议（心跳 1Hz、对话框 ui_request/ui_response、权限规则命令）。总方案见《Electron+pi-RPC-多Agent桌面应用完整实现方案.md》，任务拆分见 `tasks/`（开工前先读对应任务文档）。

**仓库边界**：pi-hub 是外部独立项目（自有工具链与门禁）；其 `docs/design.md` 是协议唯一真相。本仓库不修改 hub 代码；hub 协议变更 → 先走 hub 仓库流程，再同一提交内同步本仓库 contracts 镜像类型。

## 不能做哪些事

- 不能写 TODO：必须把当前任务完成到所有测试通过、无已知异常问题，交付一个生产可用的版本才算结束
- 不写兼容代码：不兼容老代码、不留旧路径别名或双轨字段，同一事实只需要一套接口实现，发现旧实现立即删除
- UI 使用同一套风格的组件：基于现有 shadcn 组件开发；后面会多次使用的 UI 必须封装成通用组件，避免重复开发
- 不能留有安全问题和内存泄漏问题：出现必须修复，不允许「先记着以后修」
- bug 修复不做最小修补：不能只基于现在的实现考虑修复方案，要为以后的项目扩展考虑，用可持续、可扩展的方案根治当前 bug
- 不写版本叙事：代码、注释、UI 文案里禁止出现「v1/v2 改了什么」「某版本修复了 XX」之类的内容；版本变更历史只属于 CHANGELOG/log 文档
- 对外文档只描述当前行为：README、用户文档等不写 v1/v2 版本相关问题与新旧对比；版本差异只出现在 CHANGELOG/发布说明
- 不允许假绿：禁止为过门禁加 skip、注释或删除断言、调低覆盖率阈值
- pi-hub 协议字面量（帧类型 `ui_request`/`heartbeat`/`hub_error`、命令类型 `thread/*`、`AgentSessionEvent` 字段名等）只允许出现在 `packages/adapter/`、`packages/contracts/`（镜像类型）、测试夹具库三处，其余位置出现即 CI 失败
- 禁止 `git stash` / `git reset --hard` 等一切销毁性 git 操作

## 代码风格

- TypeScript strict；结果用判别联合（`{ ok: true; ... } | { ok: false; reason }`）而非抛业务异常；垃圾输入返回空形态降级，不崩溃
- 错误 message 用中性英文；用户可见文案只写在 `renderer/src/strings/`（key + 中文文案目录），禁止在组件或主进程硬编码
- 单一真相：类型与 Port 定义只住在 `packages/contracts/`；同一事实只定义一次、放最底层被依赖的包；可变值（开关/阈值）装配注入
- 一动词一文件：文件装了两件事先拆；模块单测放同目录 `__test__/`，禁止跨包引用别的包 `__test__` 私有文件（公共测试资产只有 testkit〔含 fake-hub〕与 T1 夹具库）
- 能不用 class 就不用：一切优先写成 function；仅当 class 写法在所有方面都优于 function 实现时才允许 class，非必要不使用 class
- function 保持单一职责；一个文件不要堆太多 function——围绕一件事组织，多了就拆文件
- UI 纪律：一个 .tsx 只放一个组件或 hook，嵌套定义组件/hook 禁止（每次渲染重建）——由 `ui/no-multi-component` 插件强制
- 业务包不 `import 'electron'`（Electron API 只出现在 apps/electron），保证 `bun test` 零 mock 可测；依赖白名单与环境面纪律由 oxlint 插件 `pai/*` 强制（`oxlint-plugins/pai/`，宪法见 `.oxlintrc.json`：改规则 = 修宪法，就近同步插件测试）
- 注释只说明当前代码的作用与用途，以及代码表达不了的约束（协议事实、事件时序约定、平台坑）；禁止版本叙事（某版本改了什么/修复了什么），那是 log 文档的职责
- 格式化用 oxfmt（非门禁）；命名与注释密度跟随所在模块现状

## 验证

每步提交前四门全绿（PR 门禁，流水线由 T9 维护）：

```
bun run lint      # oxlint --type-aware：0 error 0 warning
bun run typecheck # tsc --noEmit
bun run build     # electron-vite build（main/preload/renderer 三面）
bun test          # 各模块 __test__ 单测 + T1 夹具回归
```

- 覆盖率：行/语句/函数 ≥ 90、分支 ≥ 85，只升不降；未达标只许补测试，禁止调阈值换绿
- 每个里程碑完成 = 该步骤 `__test__` 测试全绿 + 四门全绿（对照 `tasks/` 各文档「实施顺序」表）
- 含契约/并发/安全面的批次必须过独立会话对抗审查（审 diff + 方案节选：契约、不处理清单、并发预算）；integration/混沌在夜间门，E2E 在发版门
- 每个修复的 bug 必须带回归用例，用例名注明症状
- 汇报必须如实报告用例数与覆盖率数字；「门禁全绿」不等于「覆盖率达标」

## 当前项目是怎么工作的

- **进程模型**：主进程 spawn **一个** pi-hub（bun 二进制运行；env 清洗 provider key + `PI_CODING_AGENT_DIR=userData/agent` + `PI_SKIP_VERSION_CHECK=1`）；hub 进程内承载全部 thread（pi SDK AgentSession）；hub 心跳 1Hz，>10s 无心跳 = 挂死 → SIGKILL 进程组 → 重启 → 按快照逐个 `thread/resume`；Electron 退出 = 关 stdin → hub 优雅退出（协议级无孤儿）
- **数据流**：hub stdout → 帧解析器（LF 唯一分隔，U+2028 不切，16MiB 行上限）→ 协议适配（`packages/adapter`，全项目唯一认识 hub 协议的实现包：帧解码 + 事件映射 + 命令编码）→ 主进程事件批推（50ms 定时 / 满 128 条即刷，扁平有序不分桶，`apps/electron/src/main`）→ preload IPC → 渲染层 Zustand（单一 vanilla store；订阅面细粒度 selector，thread 级 / turn 级是 store 内两层折叠状态机，50ms 批内相邻同类 delta 先折叠再进 store）
- **调度与预算**：线程并发由 Electron 客户端限流（全局按内存动态 2..8、单对话 ≤3、排队可见优先）；BudgetTracker 按 `message_end` usage 计量，超预算熔断拒绝新 thread（调度/预算模块未落地：`packages/core`、`packages/api` 当前为空壳，落地任务见 `tasks/T4`）
- **权限与沙箱**：权限判定、拦截、超时默认拒绝、OS 沙箱**全部在 hub**；Pai 只做 UI 交互与提交，不镜像判定逻辑、不经手 spawn 包裹；thread 默认 `trusted:false` 不加载项目扩展。全局规则的唯一通路是 hub 热读的 `agentDir/permission-rules.json`（协议的 `get/set_permission_rules` 仅每线程 sidecar）——Pai 主进程经固定文件名白名单 Port 原子写该文件（宽容解析镜像 hub normalizeRules），会话级规则走协议命令
- **持久化**：会话真相源 = hub 管理的 session jsonl（agentDir/sessions）；`node:sqlite` 只存 UI 元数据与 thread 映射（恢复快照）；重水化首选协议（`thread/list` + `get_state`/`get_messages`）
- **认证**：仅 API key（auth/list、set_api_key、remove_key，key 只经 stdin 进 hub 侧 auth.json，Electron 零接触零回显）；无 OAuth
- **渲染层**：React + shadcn（`packages/ui`），只认识 contracts + Client 接口（mock/真 preload 可替换），不直接碰 IPC

目录：`apps/electron/`（组合根 + 壳）、`packages/{contracts, adapter, core, infra, api, ui, testkit}`（全部 Electron-free；adapter = pai-cli 协议唯一认识者）、`tasks/`（任务方案）；hub 仓库在外部（`/Users/wrr/work/pi/app`）。

## 提交与交付规范

- 只能提交自己改动的代码：只提交自己点名的文件路径；共享产物混有他人未提交变更时不提交，留待协调；他人在途的门禁失败如实标注归属，不越界代修
- 并行开发使用 git worktree 物理隔离，不共享工作区
- 没有 push 指令：只允许 commit，禁止任何 push / publish 操作
- Conventional Commits，正文引用任务文档节号（如 `T4 §实施顺序 M2`）；小步提交、每步可回滚、四门全绿后再提交
- 方案与代码同变：实现推翻方案时，同一提交内先改文档再改代码，禁止口头漂移
