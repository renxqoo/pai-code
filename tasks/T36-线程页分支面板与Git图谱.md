# T36 线程页分支面板与 Git 图谱

> 状态：定稿
> 级别：中（跨模块：contracts 新契约面 + 主进程 git 新读口 + 渲染层两页装配；无存量数据迁移）

## 0. 需求判定

现状：分支展示与切换能力已全链落地（T23：`git/branches` / `git/checkout` 契约与主进程实现、新建任务页模态分支弹窗）；线程页上下文条分支段刻意只读（T23「不处理」：运行中切分支会改工作树基线）。

本任务（用户三张设计图，1:1 还原）：

- 图一：分支面板——点击底部上下文条分支按钮弹出（向上锚定），含搜索、分支列表（点击切换、当前分支勾选、脏文件计数副文本）、底部动作行「创建并检出新分支…」「Git 图谱」；
- 图二：Git 图谱弹窗——近全屏，标题栏（标题 + 刷新 + 关闭）+ 表格（图 | 描述 | 日期 | 作者 | 提交），图谱列为 SVG 泳道（节点 + 折线），HEAD 橙色 pill + 分支灰色 pill；
- 图三：新建分支弹窗——大尺寸弹窗，标题/副题/字段标签/辅助说明/右下按钮组。

## 1. DESIGN

### 1.1 外部契约

- `git/branches` 结果扩一项：`dirtyFiles: number`（int ≥ 0）。语义 = 未提交更改的已跟踪文件数，与 checkout 守卫同口径（`status --porcelain --untracked-files=no` 行数）——面板上展示的数字就是会阻止切换的数字。非仓库空形态 `dirtyFiles: 0`。
- 新增 `git/graph`：params `{ cwd }` strict；result `GitGraphView = { isRepo: boolean, commits: GitGraphCommit[], truncated: boolean }`；`GitGraphCommit = { hash, shortHash, subject, author, timestamp(epoch 秒), parents: string[], refs: string[], isHead }`（strict）。
  - `refs` 只含本地分支装饰（`--decorate-refs=refs/heads`），`HEAD -> main` 形态原样透传，拆 pill 归渲染层纯函数；
  - `truncated = true` 表示仓库提交数超过展示上限（上限 500，`--max-count=501` 探测）。
- 错误形态：沿用 git/* 既有 reason 字典（`not_a_repo` / `branch_exists` / `unknown_branch` / `dirty_worktree` / `invalid_branch` / `git_unavailable` / `cwd_not_found` / `git_failed:<摘要>` 及进程级 timeout/output_too_large 摘要）；路由层 `cwd_not_allowed` 门禁与 `git/branches` 一致。
- 事件/副作用时序：checkout 成功 → 渲染层 `branchRevision` 递增 → 两页分支视图与图谱视图失效重拉；图谱无轮询——仅打开时拉取 + 手动刷新按钮。

### 1.2 内部问题域

处理：

- 主进程：`git log` 拓扑数据（topo-order + parents + 本地分支装饰 + 截断上限）；分支列表附带脏文件计数；
- 渲染层：泳道几何纯函数（commits → 每条提交的 lane 与连边）、refs token → pill 纯函数、日期列格式化；
- 装配：线程页上下文条分支段开放锚定面板（搜索/切换/创建入口/图谱入口）；Git 图谱弹窗；新建分支弹窗视觉对齐图三；新建任务页统一到同一面板。

不处理（写清归属）：

- **运行中线程的分支切换**：引用 T23 裁决——工作目录上任一线程在跑（streaming / agents working）时，线程页分支段保持只读（无 chevron 无面板）。归属：`composer-region` 装配层据 live store 判定；
- 远程分支 / tag 装饰 / push / pull / fetch：归属未来任务（图谱 refs 只取本地分支）；
- 图谱行点击（检出某个提交 / 回滚 / cherry-pick）：本版图谱只读；
- 新建分支的基准选择：仅当前 HEAD（弹窗辅助文案明示；契约 `create` 语义不变）；
- 图谱虚拟滚动：500 行上限内直接渲染 DOM，不做虚拟化；
- 线程页工作区（目录）段切换：维持只读，非本任务范围。

### 1.3 并发与一致性预算（违反 = 缺陷）

- git 子进程沿用 T23 隔离：无 shell、5s 超时、1MB 输出上限、`core.hooksPath=/dev/null` + `core.fsmonitor=false`；
- `git/graph` 同 cwd 在途单飞（与 `git/branches` list 同机制）；checkout 成功后失效 graph 单飞缓存（否则刷新读到切换前快照）；
- checkout 全局串行链（checkoutTail）不变，graph 只读不参与串行；
- 图谱行数硬上限 500（主进程截断，渲染层不设守卫）；渲染层图谱视图无定时器；
- `git/branches` list 多跑一条 status：探测 1 + refs 1 + head 1 + status 1 = 4 次 execFile，均在 5s 超时预算内。

### 1.4 用户裁决落档

- **用户裁决**：三张设计图 1:1 还原；UI 由 3 个并行 UI agent 实现（主会话不指定组件选型，只给标准：shadcn 风格 / 项目既有组件、主题 token、文案走 strings、props 数据契约、不写业务逻辑），逻辑由主会话在 UI 产物上接线。
- **用户裁决（延伸）**：同一「切换分支」能力在新建任务页与线程页统一为锚定面板，收口时删除模态 `BranchPickerDialog` 与旧 `newTask.branch*` 文案 key（单轨）。
- **引用裁决（T23）**：运行中不切分支（见 1.2 不处理）。
- 默认裁决（否决窗口）：图谱上限 500 条；日期列 `MM/DD HH:mm` 本地时区；refs 只本地分支；脏计数不含未跟踪文件。

## 2. IMPLEMENTATION

### 2.1 里程碑（每阶段四门全绿后提交）

| 阶段 | 内容 | 验收点 |
| --- | --- | --- |
| M1 契约 + 主进程数据面 + 文案预置 | `api.ts`（`git/graph` schema + `dirtyFiles`）+ 主进程 list 脏计数 + `git-graph` 读口（单飞/截断/失效）+ 路由接线（checkout 成功失效图谱缓存）+ strings `branch` / `gitGraph` 双语 key + 本文档 | 四门绿；既有用例更新后全绿 |
| M2 UI 并行还原 | 3 个 UI agent：图一分支面板（含上下文条触发器插槽）、图二图谱弹窗、图三新建分支弹窗 | 产物过 typecheck / lint / build；纯展示组件（props 驱动） |
| M3 逻辑接线 | `git-actions` / `workspace-actions` / `live-controller` / `use-git-graph` + 泳道与 pill 纯函数 + 两页装配 + 单轨化（删 `BranchPickerDialog`、旧 key）+ 测试补齐 | 四门绿 + 覆盖率达标 |
| M4 对抗审查与收口 | 独立会话审 diff（契约 / 不处理清单 / 并发预算）→ 问题清零 → 验收清单核销 | 审查记录落档 |

过渡态说明：M1 提交后 `dirtyFiles` 已进契约与主进程（同步落地，无双轨）；`branch` / `gitGraph` 新 key 与旧 `newTask.branch*` key 短暂并存，M3 收口时删旧 key 单轨化。

### 2.2 测试口径（先列再实现）

- 契约：`git/graph` params 校验表（缺 cwd / 空 cwd / 未知键拒绝）、result strict 词表（缺字段 / 多字段拒绝）；`git/branches` 结果含 `dirtyFiles` 且非负整数拒绝负值；
- 主进程 `git-graph` 单测：log 输出解析（NUL/记录分隔符、空主题、空仓库、`HEAD -> main` refs、isHead 判定、501 截断）、探测/refs 失败 reason 透传；
- `git-branches` list 脏计数：porcelain 行数、干净 = 0、非仓库空形态 0、status 失败 reason 透传；
- 渲染层纯函数：泳道表驱动（线性 / 分叉 / 合并 / 孤儿泳道复用 / 跨 lane 连边）、refs token → pill（`HEAD -> main` / `HEAD` / 普通分支）、日期格式化；
- 渲染层组件/装配：面板渲染（当前勾选 / 脏副文本 / 搜索过滤 / 三态空文案）、上下文条运行中只读守卫、新建任务页面板化回归、`use-git-graph` 失效重拉（cwd / revision / 序号守卫）；
- api-routes 集成：`git/graph` cwd 门禁（`cwd_not_allowed` 且不触 git）+ fake 透传 + 真 git 隔离世界（造 merge 提交断言视图终态）；
- 回归：开发中发现的每个 bug 一个用例，用例名注明症状。

## 3. 验收清单

- [ ] 外部契约：`dirtyFiles` 口径 = 切换守卫；`git/graph` strict 词表 + truncated 语义；reason 字典封闭
- [ ] 边界：非仓库 / 空仓库 / detached HEAD / 脏树拒绝 / 选项形 ref 名 / 501 截断 / cwd 门禁
- [ ] 并发预算：graph 单飞 + checkout 后缓存失效 / checkout 串行不变 / 无定时器
- [ ] 不处理清单逐条落位（运行中只读、图谱只读、仅本地分支装饰）
- [ ] 单轨：`BranchPickerDialog` 删除、旧 `newTask.branch*` key 删除、无双轨字段
- [ ] 四门全绿 + 覆盖率 ≥ 90/85 只升不降 + 对抗审查问题清零 + 数字如实报告

## 4. 实施记录

- M1（2026-09-12）：契约（`dirtyFiles` + `git/graph`）+ 主进程数据面（list 脏计数、`git-graph` 读口、路由接线与 checkout 后缓存失效）+ strings 双语 key + 本文档落档。
- M2（2026-09-12）：3 个并行 UI agent 看图自主选型交付三件 UI（AnchoredPanel 底座 / BranchPanel 内容件 / 图谱弹窗组件族 / 新建分支弹窗重做），主会话验收后入库。
- M3（2026-09-12）：渲染层接线——`listGitGraph` 动作链（git-actions → live-controller → workspace-actions）、`useGitGraph`（enabled 门 + 失效重拉 + 序号守卫）、线程页装配（branch-switch-lock 运行中锁定 + 面板/创建/图谱编排 + 通知条失败面）、新建任务页面板化、单轨化（删 `BranchPickerDialog`、旧 `newTask.branch*` key 清除）。测试：泳道布局表驱动、refs pill、日期格式、面板/锁/钩子/上下文条/两页装配集成。
