# Pai

Pai 是一个 macOS 上的 AI 干活助手：你用一句话说清要什么，它自己去读项目、写代码、跑任务，把做完的结果交给你。

比如「给这个项目加个深色模式」——它会找到该改的文件、动手修改、运行验证，每一步在界面上都看得见。

把活交给它是放心的：凡是要运行命令、改动重要文件的操作，它都会先停下来征求你的同意，你点「允许」才继续。

它也扛得住多线作战：多个任务同时进行，一个任务里还能派出子助手分工并行；每个任务的分支图谱、进度和用量，随时可查。

想知道它内部怎么运转（引擎、进程、协议、代码分层），往下看「架构」。

## 架构

- monorepo：bun workspaces，scope `@paiapp/*`，包源码直出（业务包零构建耦合，`bun test` 零 mock 可测）
- 单 hub 宿主：hub 由随包 bun 二进制运行，本仓库不修改 hub 代码；hub 协议文档是协议唯一真相，本仓库 `contracts` 包维护类型镜像
- 分层纪律：业务包不 `import 'electron'`（Electron API 只出现在 `apps/electron`），由 oxlint 插件 `pai/*` 在 lint 门禁强制

### 目录

| 路径 | 职责 |
| --- | --- |
| `apps/electron` | 应用壳：主进程 / preload / renderer 三面（electron-vite + React） |
| `packages/contracts` | Client 接口、hub 协议镜像、Port 定义（单一真相） |
| `packages/adapter` | hub 协议适配：帧解析、事件映射、命令编码、夹具库 |
| `packages/core` | 线程调度与预算：客户端限流、StreamAggregator、Budget |
| `packages/infra` | HubSupervisor（spawn/心跳/恢复）+ 视图持久化（node:sqlite） |
| `packages/api` | 主进程 API 服务、IPC handlers 与安全加固 |
| `packages/ui` | 渲染层通用组件（shadcn 风格）与 strings 文案目录 |
| `packages/testkit` | 测试装置（fake-hub 等） |
| `oxlint-plugins/pai` | 工程纪律 oxlint 插件：依赖白名单、环境面、UI 规则 |
| `rule/` · `tasks/` · `scripts/` | 重构规则 · 任务文档 · typecheck / 打包脚本 |

## 环境要求

- [bun](https://bun.sh)（包管理、测试运行时、hub 运行时）
- macOS（当前打包目标 mac arm64）
- 真实运行需要 pi hub 检出：默认探测本仓库旁级 `../pi/app`（`dist/cli.js` 或 `src/cli.ts`），也可用环境变量 `PAI_HUB_ENTRY` / `PAI_BUN_PATH` 指定；无 hub 检出时，单测与 UI 开发走 testkit 的 fake-hub / mock Client

## 快速开始

```bash
bun install

# 开发（electron-vite dev，热更新）
bun run --filter '@paiapp/electron' dev
```

## 门禁（四门，提交前全绿）

```bash
bun run lint      # oxlint --type-aware：0 error 0 warning
bun run typecheck # tsc --noEmit
bun run build     # electron-vite build（main/preload/renderer 三面）
bun test          # 各模块 __test__ 单测 + 夹具回归
bun run ci        # 以上全部
```

覆盖率阈值（`bunfig.toml`）：行 / 语句 / 函数 ≥ 90，分支 ≥ 85，只升不降。

## 打包

```bash
bun run --filter '@paiapp/electron' package   # mac arm64 冒烟包（未签名）
```

打包流程先跑 `scripts/packaging/sync-resources.ts`，把 bun 二进制与 hub 入口拷入仓库根 `resources/`（打包态 extraResources 布局）；来源默认本机 bun 与旁级 `../pi/app` 构建产物，可用 `PAI_BUN_PATH` / `PAI_HUB_ENTRY` 覆盖。

## CI（GitHub Actions）

- `pr.yml`：push / PR 触发，macOS runner 跑 `bun run ci` 四门
- `nightly.yml`：每夜定时跑同套门禁，integration / 混沌装置接入点
- `release.yml`：手动触发，E2E / 打包冒烟 / 签名公证接入点

## 工程规约

规约唯一真相是 [AGENTS.md](AGENTS.md)：Conventional Commits、单一真相、零兼容层、一动词一文件、UI 纪律、四门验证、提交与交付规范。参与贡献前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。
