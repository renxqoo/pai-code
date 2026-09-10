# T32 侧栏 store 订阅化与区域自组装

> 状态：已核销（M1/M2/M3 全部收口，验收清单见 §3.6）
> 迁移单元：侧栏交互面（一个可观察业务行为：会话侧栏的浏览/过滤/折叠/置顶/行内操作/面板开合，及其与全局热键、Esc 链、标题栏的联动）
> 旧实现：`apps/electron/src/renderer/src/screens/workspace-main.tsx`（574 行，侧栏枢纽职责）+ `renderer/src/sidebar/`（8 组件 + 12 模块 + 12 测试文件）+ `renderer/src/screens/sidebar-view-model.ts` + `hooks/use-{project-files,sidebar-resize,session-ages}.ts` + `hooks/use-usage-panel.ts`
> 基线：分支起点四门全绿（lint 0-0 / typecheck / build / test：1370 用例、178 文件、0 失败）
> 关联：AGENTS.md 渲染层条目；T8（渲染层 UI）；T17/T18/T29/T30（侧栏各期演进）

## 0. 背景与病灶（审计动机）

渲染层建有 zustand vanilla store + 细粒度 selector（`live/store.ts`），但全仓库唯一订阅点是 `use-live-workspace.ts`：约 20 个 selector 聚合成 `LiveWorkspaceView` 大对象交给 `WorkspaceMain` 单组件，再以 props 分发（Sidebar 34 个、Composer 约 40 个、ThreadStage god-object）。selector 细粒度在 hook 层终止——任何后台线程 `sessionUpdated` / 流式 delta 批推（50ms，≤128 条/批）都重渲整个工作区树，靠手写 memo 纪律防守（`workspace-main.tsx:105/292/320` 三处注释自认，T30 审查 高-2 即此类）。本任务把侧栏区域改为**区域自订阅**，根治该区域的 props 漏斗与 memo 脆弱性。

## 1. DESIGN（设计基线）

### 1.1 外部契约

**组件面（消费方：workspace-main 与侧栏内部组装）**

| 组件 | props | 说明 |
| --- | --- | --- |
| `Sidebar`（壳） | **0** | 几何/视图/搜索/列表/面板/footer 全部区域内解决 |
| `SessionRow` | `session, age, active, pinned?, indent?` | 行内动作直接调 `workspaceActions` / `navigation` 单例 |
| `PinnedSection` | `sessions, ages, activeSessionId` | 数据 props |
| `ProjectSection` | `group, ages, activeSessionId` | 折叠/显示更多经 ui store；行内动作同上 |
| `QuickActionsRow` / `ViewSwitchTabs` / `SidebarFooter` | **0** | ui store 派发 |
| `SidebarSearchInput` | `query, focusToken, onQueryChange, onClose`（不变） | 由新增 `SidebarSearch` 组装层驱动 |
| `TitleBarLeft` | 本期不改签名 | `collapsed/width/onToggle` 由 WorkspaceMain 从 ui store 喂（M3） |

**store 与单例面（消费方：任何渲染层模块，import 即用）**

- `uiStore`（新增 `renderer/src/ui/ui-store.ts`，zustand vanilla 模块单例）：字段 `sidebarWidth / sidebarCollapsed / sidebarView / sidebarSearchOpen / sidebarQuery / searchFocusToken / sidebarGroupFold / settingsOpen / settingsEntry / usageOpen / newTaskOpen / newTaskCwd / newTaskKey / newTaskDialogOpen / composerDraft / drafts / projectFiles{target,tree,loading}`。动作：纯 `set`，零 IO——**副作用居留订阅点的 effect**（如用量页开页即 `refreshAllStats` 保留在 `useUsagePanel` 的 effect，由 `usageOpen` 订阅驱动；store 动作不 invoke）。具名复合动作：`openNewTask(cwd)`（key 递增、dialogOpen 复位）/`closeNewTask()`、`openSidebarSearch()`（收起态先展开再递增 token）、`closeSidebarSearch()`（收起并清词）、`toggleSidebarCollapsed()`、groupFold 变更走 `toggleGroupFold / expandGroup` 纯函数（现有，不动）。测试缝：`reset()` 动作（先例：live store `reset()`）+ 客户端渲染测试直接 `setState` 种子（运行时读 `getState`，不经 SSR 快照）。
- `workspaceActions`（新增单例导出，`live/workspace-runtime.ts`）：`createWorkspaceActions()` 工厂保留导出。**前置修**：runtime 顶层 `createBridgeClient(window.pai)` 加 `typeof window !== 'undefined'` 守卫（现状同文件 `:21` 已有守卫先例，`:12` 漏加——非 DOM 测试 import 侧栏组件链即在模块求值时 ReferenceError）。
- `navigation`（`screens/workspace-navigation.ts` 重构为无参单例）：**两条出口语义照旧**——`onSelectSession` = 关新建任务页 + 选会话（不动设置页、不动右侧面板）；`onOpenSavedSession` = 关新建任务页 + 打开 + 关设置页（不动面板；T30 高-1 回归钉住「不清面板」）。命令面板/设置页历史/侧栏行共用。
- `projectFiles` 控制器（新增 `sidebar/project-files.ts`）：`openProjectFiles(cwd, name)` / `closeProjectFiles()`；`listProjectFiles` 经装配注入（可变值注入惯例，注入缝即测试缝），代次（epoch）防竞态行为与旧 `useProjectFiles` 同构。
- `useLiveWorkspace` 本期其余不动；`LiveWorkspaceView.actions` 改指单例（引用等价，`live/store.ts` 不动）。

**Esc 裁决（用户裁决 U4：注册制）**

`esc-action.ts` 改为有序注册表：覆盖层注册项 `{ id, isOpen(state), action }`，注册序即收起序（规格 = 现 if-链序：dismiss-dialogs → close-palette → close-usage → close-new-task → close-settings → close-project-files → close-sidebar-search → close-panel）；bash/停止确认链为表尾纯规则，不入注册表。`EscState` / `EscAction` 判别联合不变（消费方零改动）。`close-settings` 注册项动作须同时清 `settingsEntry`（一次性分区入口，关闭即清——现状 `workspace-main.tsx:139-148`）。

**测试装置（用户裁决 U3）**

新增 devDependency：`apps/electron` 加 `happy-dom`。`testing/dom.ts` 惰性幂等注册（含 `IS_REACT_ACT_ENVIRONMENT = true`，React 19 act 要求）；`testing/render.ts` 封装 createRoot + act + 卸载清理。bun test 单进程顺序执行，per-import 安全；与既有 SSR 测试（`renderToStaticMarkup`，无需 DOM）共存。装置文件计入覆盖率时必须被用例全行使，否则调整 coverage 口径，禁止调阈值。

### 1.2 内部问题域

**处理**：侧栏全部 UI 态入 ui store；区域组件自订阅；行内/菜单动作走单例；视图模型下沉 `emptyState`；ages tick 下沉列表区域；Esc 注册制；客户端渲染测试装置。

**明确不处理**（每项写归属）：
- ThreadStage / Composer / SettingsScreen 的 props 面与 god-object —— 后续同模式各区域任务
- `useLiveWorkspace` 溶解、`toCards`/`buildComposer` 下沉 —— 同上
- T4 调度/预算的 store 归属 —— `tasks/T4`（届时按「写权+生命周期」规则评估）
- ui store 持久化（persist 中间件）—— 触发条件：用户显式要求几何/草稿落盘；本期仅内存存活
- ui store slice 化 —— 触发条件：出现第三写权或 persist 分组边界
- 侧栏拖拽调宽的**接线**（拖拽纯函数与测试保留；现状 separators 处理器无挂载点即不可达，见 D4）—— 后续 UI 任务接线时在壳内挂载
- e2e 旅程 —— 发版门（仓库尚无 e2e 装置，本期无跨进程新接缝；四门+对抗审查收口）

### 1.3 并发与性能预算（违反 = 缺陷）

- 后台线程事件（sessionUpdated / 流式 delta 批推）不重渲**侧栏子树与具名 memo 边界组件**（Composer 等）。WorkspaceMain/ThreadStage 本期仍订阅 store 且随批推重渲（§1.2 不处理项），判据以此为界。
- `ages` 30s tick 仅重渲侧栏列表区域；全局 ages 定时器至多 1 个（项目文件面板打开、列表区卸载时为 0）。
- store 派生（卡片/视图模型）引用稳定（WeakMap 按输入缓存，先例 `threadModelOf`）：无关 set 不产出新引用、不击穿子树 memo。
- ui store 动作零 IO；projectFiles 异步加载是侧栏区域唯一 IO 面，且代次防竞态；`listProjectFiles` 注入引用稳定（不在 store 动作内联建闭包）。

### 1.4 用户裁决落档

| # | 裁决 | 内容 |
| --- | --- | --- |
| U1 | 死交互钮 | 快捷区「自动化」入口**保留**（刻意入口占位，含现状 noop）；footer「工作流」、快捷区「插件市场」、视图行两个 aria-hidden 占位钮**删除** |
| U2 | newTask 归属 | open/cwd/key/dialogOpen 迁入 ui store；Sidebar 归零 props。**派生语义变更（有意）**：newTask/usage/projectFiles 开合态随迁获得跨语言切换重挂载存活（现状重挂载即复位，用户可达路径：新建任务页→设置改语言，现状页消失、迁后保持）；如不可接受改为挂载时复位 effect，默认取存活 |
| U3 | 订阅层测试 | 本期引入客户端渲染测试装置（happy-dom + react-dom/client），订阅组装层写真渲染组件测试 |
| U4 | Esc 链形态 | 本期改注册制优先级表（`EscState`/`EscAction` 契约不变） |

## 2. IMPLEMENTATION（施工图）

### 2.1 旧实现审计结论

四条标准逐文件过（正确性/契约/质量/依赖方向）。清单：

**真 bug（B#）**
| # | 位置 | 级别 | 症状 | 处置 |
| --- | --- | --- | --- | --- |
| B1 | workspace-main.tsx:449 | 性能/中 | 内联 `projectFiles` 对象每渲染新引用，面板打开期间击穿 Sidebar memo（父级每批流式 delta 重渲侧栏） | 本波修（ui store 引用稳定） |
| B2 | workspace-main.tsx:277 + hooks/use-session-ages.ts | 性能/中 | ages 30s tick 在 WorkspaceMain 层，全工作区树周期重渲；新 `ages` 对象每 tick 必击穿 Sidebar memo | 本波修（tick 下沉列表区域） |
| B3 | quick-actions-row.tsx / view-switch-tabs.tsx / workspace-main.tsx:380 | UX/低 | 可点击无行为的死钮 ×4（自动化保留见 U1） | 本波修（删 3 处，U1） |
| B4 | sidebar.tsx:27-30 | 文档/低 | 孤儿注释（描述已删除的运行状态 props） | 本波修 |
| B5 | sidebar/__test__/sidebar.test.tsx:52 | 测试/低 | 夹具残留 `onOpenRuntime`（SidebarProps 无此键）。**实测定论**：`apps/electron/tsconfig.json:12` 将 `src/**/__test__/**` 排除出 typecheck，类型门禁不可见 | 本波删夹具行 |
| B6 | workspace-main.tsx:57-67,118-126 | 正确性/中 | `uiState` 模块可变对象 + effect 补写：unmount 窗口期写入可能丢失（语言切换重挂载前一帧），无订阅语义 | 本波修（ui store 取代） |
| B7 | sidebar.tsx:172-177 vs :213 | 一致性/低 | 文案双轨（label props vs 直读 copy） | 本波修（统一直读 copy） |
| B8 | screens/__test__/esc-action.test.ts:10 | 测试/低 | 夹具残留 `runtimeOpen`（EscState 无此字段；同因 __test__ 免 typecheck） | 本波删 |
| B9 | screens/__test__/workspace-navigation.test.ts:15 | 测试/低 | 夹具残留 `closePanel`（NavigationDeps 无此字段） | 本波删 |

**重复（D#）**：D1 SessionRow 5 回调 ×3 转发链（Pinned/Project/平铺）→ 单例根治；D2 空态派生 `listEmpty` 在组件 vs 视图模型已有过滤链 → `emptyState` 下沉 `buildSidebarViewModel`；D3 WorkspaceMain 侧栏 useState ×8 与（新）ui store 同职能 → 删旧路径；D4 `useSidebarResize` 的 separators 处理器全仓无挂载点（拖拽调宽不可达，仅纯函数有测试）→ 本波不接线（行为等价原则），登记挂账（§1.2）。

**契约缺口（C#）**：C1 `LiveWorkspaceView.actions` 由 hook 内创建 → 模块单例（消费方无感）；C2 `createNavigationHandlers(闭包输入)` → 无参单例（两出口语义照旧）；C3 `SidebarProps` 34 字段公共接口 → 0 props（唯一消费方 workspace-main + 测试改写）；C4 SessionRow 可选回调契约（`onClose?` 不传则无入口）删除——生产无只读行消费方，门控保留数据驱动项（canRetire=live 且非流式、canTogglePin=sessionPath 非空）。

审计状态：sidebar/ 全部组件与模块、screens/{workspace-main,sidebar-view-model,esc-action,use-esc-dismiss,workspace-navigation,use-new-task-page}、hooks/{use-project-files,use-sidebar-resize,use-session-ages,use-usage-panel,cmd-hotkeys}、live/{workspace-runtime,workspace-actions,use-live-workspace,store(折叠概貌)}、layout/title-bar-left、app.tsx、workspace-screen.tsx、strings/{zh,en}、sidebar/session-row/esc-action/workspace-navigation 测试均已读。未读文件不进裁决表。

### 2.2 逐模块裁决表

| 旧文件 | 裁决 | 审计依据 | 动作 |
| --- | --- | --- | --- |
| sidebar/sidebar.tsx | 重写 | B2/B4/B7/D2/C3 | 壳 + 区域组装，0 props |
| sidebar/session-row.tsx | 重构 | D1/C4 | 5 数据 props + 单例动作；删可选回调 |
| sidebar/pinned-section.tsx | 重构 | D1 | 数据 props |
| sidebar/project-section.tsx | 重构 | D1 | 数据 props + ui store 折叠 |
| sidebar/quick-actions-row.tsx | 重构 | B3/U1 | 0 props；删插件市场，留自动化 |
| sidebar/view-switch-tabs.tsx | 重构 | B3/U1 | 0 props；删两个占位钮 |
| sidebar/sidebar-search-input.tsx | 复制 | — | 纯展示不动，新增 `sidebar-search.tsx` 组装层驱动 |
| sidebar/sidebar-footer.tsx | 重构 | B3/U1 | 0 props；动作元组 3→2 |
| screens/sidebar-view-model.ts | 复制+微修 | D2 | 返回值加 `emptyState: 'none'/'filtered'/null` |
| sidebar/{group-collapse,build-*,filter-sessions,exclude-archived,hidden-projects,format-sidebar-age,rename-commit,session-card-model,sidebar-view,build-file-tree}.ts | 复制 | — | 不动 |
| hooks/use-session-ages.ts | 复制 | B2 | 调用点迁列表区域 |
| hooks/use-sidebar-resize.ts | 复制 | D4 | 宽度初值/落值接 ui store；separators 死接线不处理（§1.2） |
| hooks/use-project-files.ts | 重写 | 同构 | → `sidebar/project-files.ts` 控制器（epoch 防竞态行为照搬），**同提交删 hook** |
| hooks/use-usage-panel.ts | 复制+微修 | §1.1 副作用居留 | `usageOpen` 迁 ui store；开页 `refreshAllStats` effect 保留在 hook（订阅 `usageOpen` 驱动） |
| screens/workspace-main.tsx | 重构 | B1/B2/B6/D1/D3 | 删侧栏枢纽职责（预计 −150 行） |
| screens/use-new-task-page.ts | 复制+微修 | U2 | open/cwd/key/dialogOpen 迁 ui store，装配不动 |
| screens/use-esc-dismiss.ts | 复制+微修 | U4 | 输入从 ui store 读 |
| screens/esc-action.ts | 重构 | U4 | 注册制；`EscState`/`EscAction` 不变 |
| screens/workspace-navigation.ts | 重构 | C2 | 无参单例 |
| live/workspace-runtime.ts | 复制+微修 | C1 | 导出 `workspaceActions` 单例 + `:12` window 守卫（§1.1 前置修） |
| live/workspace-actions.ts | 复制 | C1 | 工厂保留 |
| layout/title-bar-left.tsx | 复制 | — | 签名不动，喂给它的值改从 ui store 读 |
| live/store.ts / live/use-live-workspace.ts | 复制 | C1 | `LiveWorkspaceView.actions` 指单例，其余不动 |
| workspace-main 内 `uiState` 对象 | 不移植 | B6 | ui store 取代，**M1 同提交删除**（零双轨） |
| strings/zh.ts、en.ts | 复制+微修 | U1/B3 | 删 workflows/pluginMarket 键；新增键零个 |

新增文件：`ui/ui-store.ts`、`ui/__test__/ui-store.test.ts`、`sidebar/sidebar-search.tsx`、`sidebar/session-list-region.tsx`（命名可调）、`sidebar/project-files.ts`、`sidebar/__test__/{project-files}.test.ts`、`testing/dom.ts` + `testing/render.ts`（含 happy-dom devDependency，U3）、`screens/__test__/esc-registry.test.ts`（词表封闭性表驱动）、`sidebar-view-model` emptyState 用例（进既有 `screens/__test__` 或就近新建）。

### 2.3 测试计划

- 旧测试 = 行为规格，迁移矩阵见 §3.4；每个 B# 一个回归用例（B1/B2 用客户端渲染测试断言重渲边界，**判据限定侧栏子树 + 具名 memo 边界组件**：渲染计数器子组件，流式批推/age tick 后其渲染次数不增；WorkspaceMain/ThreadStage 不在判据内，§1.2）。
- 必测清单：Esc 注册表词表封闭性（每个 close-* 恰由一层产出、注册序钉死）表驱动；**热键门控矩阵**（dialogs/palette/newTask/usage/settings/projectFiles 对 ⌘K/⌘N 的整体失效与 ⌘P 的独立门控，规格见 §3.1-11）；projectFiles 代次竞态（迟到的旧响应不覆盖新目标、close 即复位）；视图模型 emptyState 三态；ui store 动作纯 set（含 groupFold 联动重置、openNewTask key 递增、closeSidebarSearch 清词）；U2 派生语义（locale 重挂载后覆盖层保持）。
- 装置（U3）：§1.1；装置文件覆盖率口径见同节。
- 覆盖率：行/语句/函数 ≥90、分支 ≥85，只升不降；如实报告数字。

### 2.4 实施顺序（每阶段：四门 → 独立对抗审查 diff → 提交，提交引用本文节号）

- **M1（试运行，验证流程本身；状态层整体迁移，Sidebar props 面不变、行为零变化除 U2 派生项）**：ui store 全字段 + 复合动作；`workspaceActions`/`navigation` 单例 + runtime window 守卫；projectFiles 控制器化（删 useProjectFiles）；useUsagePanel/useNewTaskPage 状态源迁移（副作用 effect 居留）；WorkspaceMain 全部侧栏相关 useState 迁 store；**同提交删 `uiState`**；测试装置（happy-dom devDep + testing/）；夹具腐烂清理（B5/B8/B9）。
- **M2**：Sidebar 壳归零 props、区域订阅化（search/list/footer/quick-actions/view-tabs）、SessionRow 单例化（C4）、死钮删除（U1）、视图模型 emptyState、B7 文案统一；SSR 测试改写 + 客户端渲染装置用例与 B1/B2 回归；**同提交删 `SidebarProps`**。
- **M3**：Esc 注册制（U4，含 close-settings 清 settingsEntry）、热键/Esc 链/TitleBarLeft 接 ui store、WorkspaceMain 收尾瘦身、清理（B4、孤儿引用）。

依赖关系：M1 含 M2 所需全部状态与动作（usage/newTask/projectFiles 均在前），无倒置。失败清单按模块分组任务化；每阶段独立提交可 revert。

## 3. MIGRATION（迁移单元：侧栏交互面）

### 3.1 行为规格基线（等价判定标准）

1. ⌘K：收起态先展开侧栏再聚焦（不得把焦点劫进零宽容器）；已展开重新聚焦（token 递增）。
2. Esc 链（注册序为规格）：对话框 → 面板(⌘P) → 用量页 → 新建任务页 → 设置页 → 项目文件面板（侧栏可见才参与）→ 侧栏搜索（可见才参与）→ 右侧面板容器 → bash 中止 → 停止确认链。
3. 侧栏搜索：Esc 收起并清空；侧栏收起时过滤词保留、展开恢复；可见性门控见 2。
4. 项目组：折叠切换联动重置该组「显示更多」展开态；「显示更多」解除截断。
5. 草稿：按会话隔离；语言切换根重挂载存活。
6. 导航两出口（语义照旧，禁止合并）：`onSelectSession` = 关新建任务页 + 选会话（**不动设置页、不动右侧面板**）；`onOpenSavedSession` = 关新建任务页 + 打开会话 + 关设置页（**不动面板**，T30 高-1 回归钉住）。
7. 行内动作：置顶切换（sessionPath 非空才有钉子）；重命名（空/同名视为取消）；关闭（dispose，文件保留）；回收（仅 live 且非流式）。
8. ages：分钟级粒度相对时间标签。
9. 项目文件面板：占据侧栏内容区（快捷区/Tab/列表/footer 不渲染）；打开时先收侧栏搜索（面板自带搜索框）。
10. 死钮：按 U1 删除（工作流/插件市场/占位钮消失，自动化保留）——**有意变更**，删除项的旧断言随矩阵移除。
11. **热键门控矩阵**（现状规格，M3 重接线不得漂移）：⌘N/⌘K 在 dialogs>0 / palette / newTask / usage / settings / projectFiles 任一开时整体失效；⌘P 独立门控 = dialogs=0 且整页覆盖（newTask/usage/settings）全关，**不含 projectFiles**（文件面板打开时仍可唤起 palette）。
12. **U2 派生变更（有意）**：newTask/usage/projectFiles 开合态跨语言重挂载存活（现状复位）；见 §1.4-U2。

旧测试清单：sidebar.test.tsx（SSR 冒烟 14 用例）、session-row.test.tsx（hover/命中/指示位/回收门控）、纯函数 10 文件（build-{pinned,time,project-groups,file-tree}+filter-sessions+exclude-archived+hidden-projects+group-collapse+format-sidebar-age+rename-commit）、esc-action.test.ts、workspace-navigation.test.ts、sidebar-drag.test.ts。

### 3.2 审计结论引用

见 §2.1（B1–B9 / D1–D4 / C1–C4），不重复抄写。

### 3.3 API 对照表

| 旧签名 | 新签名 | 理由 |
| --- | --- | --- |
| `<Sidebar {...34 props} />` | `<Sidebar />` | C3 |
| `useProjectFiles(listProjectFiles)` | `openProjectFiles(cwd,name)` / `closeProjectFiles()`（装配注入 lister） | C1 同构 |
| `createNavigationHandlers({closeNewTask,selectSession,openSavedSession,closeSettings})` | `navigation` 单例（无参） | C2 |
| `createWorkspaceActions()`（hook 内） | `workspaceActions` 单例（工厂保留） | C1 |
| `escActionFor(state)`（if-链） | `escActionFor(state)`（注册表驱动，签名不变） | U4 |
| `SessionRow onSelect/onClose/onRename/onTogglePin/onRetire` | 单例直调（props 删除） | C4 |
| `SidebarFooterAction` 元组长度 3 | 2 | U1 |

### 3.4 测试迁移矩阵

| 旧测试 | 新去处 | 动作 |
| --- | --- | --- |
| sidebar.test.tsx 冒烟用例（快捷区/Tab/置顶/相对时间/显示更多/footer） | 子组件级 SSR（sections/rows/tabs/footer 维持 props 驱动）+ `session-list-region` 客户端渲染测试 | 改写（C3：壳 0 props 后整树 SSR 只见初始 store 态） |
| sidebar.test.tsx `onOpenRuntime` 夹具行 | — | 删除（B5） |
| session-row.test.tsx「无动作回调只读形态」及「未接回调的行不给回收」子句 | — | 删除+理由（C4：可选回调契约移除，无生产消费方；回收门控保留数据驱动断言 live/streaming/parked 三态） |
| session-row.test.tsx 其余（hover 交叉淡切/命中测试/流式指示位/回收门控） | 原文件 | 移植（props 面调整） |
| 纯函数 10 文件测试 | 原文件 | 移植不动 |
| esc-action.test.ts | 原文件 + esc-registry.test.ts | 移植 + 删 `runtimeOpen` 夹具行（B8）+ 新增词表封闭性表驱动（U4） |
| workspace-navigation.test.ts | 原文件 | 改写（无参单例 + ui store 种子；删 `closePanel` 夹具行 B9；「不清面板」断言保留） |
| sidebar-drag.test.ts | 原文件 | 移植不动 |
| （无既有 use-project-files 测试） | project-files.test.ts | 新增（代次竞态行为首次入测） |
| （无） | ui-store.test.ts / sidebar-view-model emptyState 用例 / B1、B2 重渲边界回归 / 热键门控矩阵用例 / U2 派生语义用例 | 新增 |
| 旧 sidebar.test SSR 的 DOM 症状钉子（项目组折叠 aria/更多菜单触发器/hover 淡入/焦点环/gap-[2px]/⌘K 徽标/清空搜索钮/显示更多条件） | sections.test.tsx（分区级 SSR）+ sidebar.test 增补（⌘K 徽标/清空搜索钮/显示更多点击接线） | 改写（核销期假绿抽查上报项 B：初版迁移漏建去处，已补齐并钉回全部钉子） |
| workspace-navigation 旧「openSavedSession 委派调用序列」断言 | 原文件 | 装置适配：离线 bridge 下委派效果不可观测（返回 unavailable），委派目标行为由 controller/openSavedSession 既有单测承担；编排断言保留（关整页 + 关设置页终态） |

### 3.5 回滚方案

每阶段独立提交，revert 即回滚；无 schema/持久化变更，回滚无数据动作。`uiState` 在 M1 提交内删除、`SidebarProps` 在 M2 提交内删除——跨阶段 revert 需整段回退（阶段内原子）。

### 3.6 验收清单

- [x] 四门全绿（lint 0-0 / typecheck / build / test 1409 过 0 失败）
- [x] 覆盖率只升不降（bun %Funcs 76.26→76.95、%Lines 86.75→86.80；声明阈值未被 bun 强制的存量差距如实记录于 M3 实施记录）
- [x] 行为规格基线 12 条逐条对照（M1 审查 7 项 / M2 审查 12 条 / M3 审查 6 条，全部等价核实）
- [x] B1–B9 各带回归用例或实测定论记录（B1/B2 重渲边界回归、B3 U1 删除+反向断言、B4 随 M2 重写清除、B5/B8/B9 夹具清理、B6 ui store 取代、B7 单轨+用例）
- [x] 对抗审查偏差清单清零（定稿前文档 21 项 + M1 7 项 + M2 4 项 + M3 3 项，全部处置或记录）
- [x] 假绿抽查：迁移矩阵之外无删除/跳过/断言弱化（独立确认见 §6）
- [x] e2e：挂账发版门（§1.2 + M2 输入事件链装置限制，真实键盘路径随发版门 e2e 补）
- [x] 文档状态推进「已核销」，实施记录逐波追加（§4）

## 4. 实施记录

### M1（试运行）收口 · 2026-09-11

- 交付：`ui/ui-store.ts`（全字段+复合动作+reset 测试缝）、`workspaceActions` 单例 + runtime window 守卫（审查高-16 前置修）、`navigation` 无参单例、`sidebar/project-files.ts` 控制器（`use-project-files.ts` 同提交删除）、`use-usage-panel`/`use-new-task-page`/`use-sidebar-resize` 状态源迁移（副作用居留）、WorkspaceMain 状态迁移（uiState 对象与同步 effect 同提交删除）、testing 装置 + happy-dom devDep（装置先行，M2 起有消费者）、夹具腐烂清理 B5/B8/B9。
- 新增测试：ui-store 10 用例、project-files 4 用例（epoch 竞态首次入测）、workspace-navigation 单例重写 3 用例；全量 1384 过 / 0 失败，四门绿（lint 0-0）。
- M1 对抗审查（独立会话）：7 项发现，处置——
  - **R1[中]** settingsEntry 跨重挂载存活违反基线 → 根治为「开沿消费即清」：useSettingsScreen 开沿守卫 + WorkspaceMain 开沿清 entry；settingsEntry 维持「不存活」语义。
  - R5[低] project-files 测试清理脆弱 → afterEach 统一 reset + 恢复默认 lister。
  - 记录项：openNewTask 顺带复位浮层（规格 §3.1-8 有意修复）；workspaceActions 双实例并存（hook 内 useMemo 与单例）——M2 改 useLiveWorkspace 消费单例消除二事实源；testing 装置 M2 起有消费者。
- 审查确认无偏差：zustand 动作解构不悬空、setSearchOpen 收口等价、submitDraftText clearDraft 注入无线程闭包陈旧、宽度写回时机等价、navigation 测试断言链路同步可靠、projectFiles epoch 跨卸载无复活窗口。

### M3（Esc 注册制 + 热键门控 + 收尾）收口 · 2026-09-11

- 交付：esc-action.ts if-链 → escLayers 有序注册表（U4，EscState/EscAction 契约不变）+ esc-registry 表驱动（词表封闭性/注册序/表尾规则/agentsActive 防混入钉子）；use-esc-dismiss 输入面收窄（ui store 拥有的五个覆盖层自订阅 + 可见性折算原子化，模块动作派发）；hotkey-gating.ts 纯函数（⌘N/⌘K/⌘P 门控矩阵单一真相）+ 表驱动，WorkspaceMain 改用；Esc 调用面收窄清理（searchOpen 订阅/closeNewTask/closeProjectFiles 残留删除）。
- 深度测试补齐（覆盖率只升不降要求驱动）：use-sidebar-resize 绑定层 4 用例（拖拽锚定/钳制/乱序事件/键盘微调——D4 纯函数之外首次覆盖 React 绑定）、session-row 交互 7 用例（导航出口/键盘/重命名流/失焦提交/动作按钮/流式指示）。装置适配补记：同一 act 批内 down+move 因批处理不刷新 ref，需拆 act；React onBlur 走冒泡 focusout。
- M3 对抗审查（独立会话）：6 条规格逐行等价核实（收起序/可见性折算/close-settings 清 entry/热键门控 De Morgan 等价/清理无残留），疑点 3 项查证通过（注册表测试真耦、模块动作不进 deps 无陈旧、旧黑盒用例等价）；#8 agentsActive 盲区与 #13 注释精度已修。
- 分支终态四门：lint 0-0 / typecheck 0 / build exit 0 / test **1409 过 0 失败**（186 文件）。
- 覆盖率（bun %Funcs | %Lines，基线=main worktree 实测）：**Funcs 76.26 → 76.95（+0.69）**；**Lines 86.75 → 86.80（+0.05）**——只升不降达成；新增面 sidebar 壳/列表区/footer/search/view-tabs/session-cards/esc-action/hotkey-gating 均 100/100。
- 既有仓况记录（非本次引入）：bunfig coverageThreshold（line≥0.9）未被 bun test 实际强制（基线 86.75 亦 exit 0），全仓数字距声明阈值有存量差距——如实记录，禁止调阈值换绿的原则不变，后续任务按包补测。

### M2（Sidebar 壳归零 props + 区域自订阅化）收口 · 2026-09-11

- 交付：sidebar.tsx 重写为 0-props 壳（几何/折叠/面板开合自订阅 + memo 边界）；新增 session-list-region（live+ui 双 store 订阅 → 视图模型 → 列表/空态，ages tick 收敛区域内）、sidebar-search 组装层、session-cards 共享派生（toCards 抽出 + WeakMap，use-live-workspace 同步改用并消费 workspaceActions 单例消除二事实源）；SessionRow 收窄为 5 数据 props + 单例动作（C4）；sections 数据 props 化（ProjectSection 折叠细粒度订阅）；quick-actions/view-tabs/footer 0 props + U1 死钮删除（自动化保留）；view-model emptyState（D2）；project-files 控制器签名 openProjectFiles(cwd)（显示名内部推导 + 先收侧栏搜索归控制器）；WorkspaceMain 删全部侧栏装配（约 −120 行，<Sidebar /> 一行）；strings 删 workflows/pluginMarket。
- 装置适配记录（U3）：happy-dom GlobalRegistrator 把 window 落成 globalThis 本体——window 定时器别名会覆盖全局并递归自身（挂载死锁，实测修复）；React 19 受控 input 的合成事件链在 happy-dom 不通（click/keydown 正常）——搜索框「输入→store」方向以 store 种子 + 受控回显单侧覆盖，真实键盘路径挂账 e2e（发版门）。
- 测试：sidebar.test.tsx 重写 14 用例（SSR 冒烟 + 客户端渲染数据形态/交互/store 断言 + B1 订阅粒度 + B2 tick 边界）、session-row 改写 5 用例、view-model emptyState 5 用例、testing 装置自检 3 用例；全量 1392 过 / 0 失败，四门绿（lint 0-0 / build exit 0）。
- M2 对抗审查（独立会话）：12 条基线 + 10 个疑点全部通过（含 expanded Set 引用等价、WeakMap 无泄漏、emptyState 与旧 listEmpty 严格等价证明、B1 新判据有效性论证）；4 项非阻断——#23 三集合依赖收细（已修）、#24 面板打开期 tick 暂停（接受，收敛设计意图）、#25 输入单向覆盖（已记录挂账 e2e）、#26 resize separators 无消费者（pre-existing = D4 已挂账）。

## 6. 假绿对抗抽查记录（独立会话，核销门，2026-09-11）

抽查范围：全分支测试 diff × T32 §3.4 矩阵逐行核对 + 跳过/门槛/配置面 grep + 新增断言质量审查。结论：非「换绿型」（被删断言对应实现均保留），但抓出三类保真度缺陷，已全部处置：
- **上报项 A**：矩阵行 1 点名的「显示更多」去处落空（渲染条件与点击接线零覆盖）→ 已补 sections.test.tsx（截断/已展开两态渲染断言）+ sidebar.test 点击接线用例（store expanded + 行数增加断言）。
- **上报项 B**：7 类矩阵外 DOM 症状钉子删除未声明 → 钉子全部测回（sections.test.tsx 六组 + sidebar.test ⌘K 徽标/清空搜索钮），矩阵补行声明去处。
- **上报项 C**：navigation「openSavedSession 委派调用」断言弱化 → 矩阵登记装置适配理由（离线不可观测，委派目标行为由 controller 单测承担）。
- 确认项：esc-action.test 除删 runtimeOpen 行逐字未动；sidebar-drag 与纯函数 10 文件零 diff；无 skip/todo/only；bunfig/CI/oxlint 配置零改动；新增断言无自我循环；harness 用例三段式防假阳性。
- 复核：补救后 sidebar/sections 套件 23 过 0 失败。

## 5. 定稿前对抗审查记录（独立会话，2026-09-11）

审查范围：本文档 × 旧实现 33 文件全量对照 + 受影响符号全仓 grep。产出 21 项（高 4 / 中 8 / 低 9），处置：
- 高-4（重挂载存活语义未声明）→ §1.4-U2 派生变更 + §3.1-12 + 用例
- 高-7（use-usage-panel 缺席、副作用与零 IO 冲突）→ 审计/裁决表补行 + §1.1「副作用居留订阅点 effect」原则
- 高-12（里程碑依赖倒置）→ §2.4 重排：M1 = 状态层整体迁移（含 usage/newTask/projectFiles）
- 高-16（runtime 顶层 window 无守卫、单例无测试缝）→ §1.1 前置修 + reset()/setState 测试缝规格
- 中 8 项：热键门控矩阵（§3.1-11 + 必测）、基线 6 双出口改写（§3.1-6）、B5 即时定论、B8/B9 夹具腐烂补录、D4 死接线挂账、settingsEntry 归属（ui store 字段 + close-settings 动作）、B1/B2 判据限定、happy-dom devDep 与 ACT 环境交付物
- 低 9 项：数字勘误（8 组件/12 模块/12 测试/14 用例/纯函数 10 文件）、sidebar-view-model 路径、live/store 表述修正、回收子句矩阵注明、uiState/SidebarProps 删除时点（§3.5）、ui store 种子缝规格化、ages tick「至多 1 个」口径、新建任务入口具名动作（openNewTask/closeNewTask）
- 审查确认与代码一致（保留原文）：Esc 链全序与门控、⌘K、折叠联动、过滤词保留、行内门控、U1 键位删除引用面、SidebarProps 恰 34 字段
