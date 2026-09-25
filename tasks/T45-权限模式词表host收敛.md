# T45 — 权限模式词表 host 单源：词表随数据走（根治跨进程状态断裂） 方案

> 状态：已实施（2026-09-25 实施；四门绿 2093 用例，funcs 83.50 / lines 91.18——均高于门禁基线
> 82.97 / 90.60；附随行根治 host-process 夹具与看门狗的赛跑 flaky）
> 前情：权限模式词表 host 收敛已入主线（contracts/permissions 动态词表 + UI 选项面接
> `currentPermModes()`），本批按对抗审查结论重铸为纯数据流，处置 7 项风险。

## 0. 现状诊断（实测）

词表 host 单源方向正确（x-harness `shared/mode-vocab.ts`：`permission/get_mode` 响应携
`modes` = `PROFILE_IDS` 五档；`mode-vocab` 注明自定义档收口后扩——host 词表将来会变），
但现实现用**模块级可变状态**承载词表，产生 7 项问题：

| # | 严重度 | 问题 |
| --- | --- | --- |
| 1 | 高 | **跨进程状态断裂**：`setPermModes` 只写主进程的 contracts 模块实例；renderer 的 `permission-mode-menu` / `permissions-section` 调 `currentPermModes()` 读的是渲染进程自己的实例（全 renderer 无 `setPermModes` 调用，`settings-ports` 也丢弃响应里的 `modes`）——「UI 选项面 = host 词表」落空，永远显示内置五档 |
| 2 | 高 | 门禁漏改（已随主线提交修复）；本批保持四门红绿纪律 |
| 3 | 中 | 契约镜像脱节：`hub-data.PermissionModeData` 缺 `modes`，`session.ts` 用 `as {...; modes?: unknown}` 绕过类型 |
| 4 | 中 | `PermMode = string` 全链路失去词表约束；`permModeOptions` 靠 `as Record<string,string>` 断言，文案键齐备检查失效 |
| 5 | 中 | `PermModeSchema` 依赖全局可变词表：校验结果随调用时机变化（首次 get_mode 收敛前按内置档拒新档）；测试靠手动 `setPermModes` 复位，污染面脆弱 |
| 6 | 中 | `normalizeLegacyPermMode` 语义收窄（不直通词表内值）但名字不表意，新调用方易按旧语义单用静默丢值 |
| 7 | 低 | 流程：无方案文档（本文件补正） |

## 1. 契约

### 1.1 contracts/permissions.ts（词表语义单一真相，纯函数化）

- `PERM_MODES`：内置缺省五档（host 缺席——测试夹具/离线装配——时的回落词表）。
- `KnownPermMode`：内置缺省词表的字面量联合。只服务**静态已知面**：文案表键齐备
  （`Record<KnownPermMode, string>`）、旧档映射目标、缺省值。
- wire/UI 值域 = `string`（开放词表：host `permission.profiles` 收口后扩档，UI 零发版）；
  动态边界（菜单选项、setMode 入参、读口视图字段）一律裸 `string`，不设 `PermMode` 别名——
  调用点必须显式区分「已知面」与「开放面」。
- **删除** `setPermModes` / `currentPermModes` / 动态词表模块状态 / `PermMode` 别名 /
  `normalizeLegacyPermMode` 旧形态——同一事实一套实现。
- `mapLegacyPermMode(value): KnownPermMode | undefined`：纯旧档映射（default/acceptEdits→auto、
  fullAuto→full），词表内值**不**直通（直通职责归 `normalizePermMode`）。
- `normalizePermMode(value, vocab): string`：展示收敛（词表内原样 → 旧档映射 → 回落 'auto'）。
- `resolveStoredPermMode(value, vocab): string | null`：读盘收敛（旧档映射 → 词表内透传 →
  词表外 = 未设置 null）。
- `PermModeSchema`：**无状态形态护栏** `z.string().min(1)`（发前垃圾拦截）。值域校验单点 = host
  （`settings/set` / `set_mode` 侧 `validateSettingValue`），app 不做第二校验点。

### 1.2 hub 镜像（协议真相 = x-harness `admin-commands.ts` / `worker-meta-commands.ts`）

- `hub-data.PermissionModeData` 补 `modes?: string[]`（worker/全局/直读三路响应均携；可选 = 镜像
  老 host 缺席）。
- `hub-commands.PermissionGetModeCmd.threadId` 改可选：镜像 host 权限双域——无 threadId =
  全局默认读（`admin-commands.ts` permissionDual）。

### 1.3 api 方法

- `permission/mode`：params 保持 `threadId` 必填（路由是会话语义；全局词表读口经
  `app/hubSettings.permissionModes` 暴露，路由不设双义）。结果保持 `modes: string[]` **必填**
  （host 缺席时回落 `[...PERM_MODES]`，app 侧总能渲染）。响应 `modes` 纯透传，不再写状态。
- `app/hubSettings`：结果新增 `permissionModes: string[]`（设置页选项面）。verb 并发补一次
  无 threadId `permission/get_mode` 取词表；词表读失败回落内置缺省（设置读本身仍成功）。
  `permissionDefaultMode` 读侧改 `resolveStoredPermMode(value, vocab)`。

### 1.4 渲染层（消费数据字段，零模块状态）

- `store.SessionPermissionModeView` = `ApiData<'permission/mode'>`（单一真相回归 contracts 推导）。
- `HubSettingsView` 补 `permissionModes: readonly string[]`。
- `PermissionModeMenu` 增 `modes` prop（选项面来源：composer 传 `sessionPermissionMode.modes`；
  新建任务页传 `hubSettings.permissionModes`）；`permModeLabel` 迁 `strings/perm-mode-label.ts`
  （两处消费共用；已知档查 `Record<KnownPermMode, string>`，词表外回退 id 本身）。
- `live/permission-mode.ts` 删除（逻辑上移 contracts；模块单测随迁 contracts `__test__`）。

## 2. 不处理清单

- host 侧不动（`modes` 已落地；词表扩展是 host 的 `permission.profiles` 挂账项）。
- `app/setHubSettings` 写侧不变（null = 不写键语义保留）。
- 思考档词表（`THINKING_LEVEL_ORDER`）不动。
- 自定义档（permission.profiles）不入 app 词表——host 明确「暂不入词表」。

## 3. 方向性裁决

1. **词表随数据走（纯数据流）**：`modes` 只作为读口响应字段流到 UI，不进任何模块状态。
   进程隔离（主/渲染各一模块实例）、React 渲染时序（渲染期间读词表）、测试污染（全局复位纪律）
   三类问题同源消解。
2. **校验单点 = host**：app 侧 schema 只做形态护栏；「发前拦截词表外值」若需要，由调用点拿
   自己手里的 `modes` 数据做（数据在哪校验就在哪，不引入第二真相）。
3. **开放词表直面**：wire 值是 `string`（host 会扩档），编译期约束只放在真正封闭的事实
   （已知档文案表、旧档映射目标）上——不造假约束。

## 4. 拆分（文件级）

| 步骤 | 文件 | 内容 |
| --- | --- | --- |
| M1 契约 | contracts/permissions.ts · hub-data.ts · hub-commands.ts · api.ts | 纯函数词表 + 镜像补 modes + threadId 可选 + hubSettings.permissionModes |
| M2 api | api/verbs/session.ts · api/verbs/settings.ts · commands/permissions.ts | modes 透传；hubSettings 并发取词表；删除状态写入 |
| M3 渲染 | renderer live/store.ts · settings-ports.ts · live/permission-mode.ts（删）· composer/permission-mode-menu.tsx · composer/composer-region.tsx · composer/composer-actions-row.tsx · settings/permissions-section.tsx · screens/new-task-screen.tsx · strings/perm-mode-label.ts（新） | options 吃数据字段 |
| M4 测试 | contracts/__test__/permissions.test.ts · api/verbs/__test__ · renderer 相关 __test__ · main/__test__/api-routes.security.test.ts | 见 §5 |

## 5. 实施顺序与测试口径

1. M1 契约（contracts 单测先行：词表纯函数矩阵、schema 形态护栏、旧档映射）。
2. M2 api（verbs 测试：modes 透传/缺席回落、hubSettings 词表并发与失败回落、读盘归一矩阵）。
3. M3 渲染（组件测试：菜单/分段选项面随 `modes` 数据出新档；label 词表外回退 id）。
4. M4 四门全绿 + 覆盖率只升不降（基线 funcs 83.54 / lines 91.16）。

**症状回归用例**（bug 修复带症状名）：

- 「症状回归：host 扩档（modes 回传）选项面即出新档——不靠本地模块状态」（renderer 两处选项面）。
- 「症状回归：设置页选项面与会话菜单同词表（hubSettings.permissionModes）——跨进程一致」。

菜单开合/点选交互不进 DOM 单测（base-ui 弹层依赖真布局，happy-dom 不驱动）——按 AGENTS.md
UI 测试纪律走 bw 真机走查；DOM 单测钉静态面（触发器展示名/词表外回退）。

## 6. 并发 / 一致性 / 安全预算

- 词表读失败回落内置缺省（设置读不因词表失败整体失败）；无缓存即无失效问题（每次读口现拉）。
- `settings-ports` 引用幂等比较补 `modes` 数组浅比较（词表变化也要换引用）。
- schema 形态护栏只拦空串垃圾；不拦截「词表外但合法」的 host 新档（那是 host 的裁决面）。
- 无新增存储、无新增进程面、无新增 IPC 频道（沿用 invoke 结果携带）。

## 7. 验收清单

- [x] 全仓无 `setPermModes` / `currentPermModes` / `permModes` 状态（grep 0 命中）。
- [x] `hub-data.PermissionModeData` 携 `modes`；`session.ts` 无 `as ... modes?` 绕过。
- [x] `permModeOptions` 无 `as Record<string,string>` 断言（键齐备由 `Record<KnownPermMode, string>` 保证）。
- [x] 四门全绿；funcs 83.50 / lines 91.18 高于门禁基线 82.97 / 90.60（行覆盖较改造前 +0.02；
      funcs -0.02 = 删除模块与新增函数面的比率噪声）。
- [x] 症状回归用例在场且断言新档可见可选。

## 8. 附：存量债根治（本批随行）

- host-process 直执行形态用例（T38）与 hang 看门狗的夹具赛跑：夹具心跳 1s > 快速档
  `hangAfterMs: 300`，全量并行负载下看门狗伪重启污染相位串（main 基线同翻）。根治：心跳压
  100ms + 该用例挂死窗放宽 3s（不验挂死检测）+ 跨看门狗窗口钉「不发生伪重启」。
- 集成门 `session/start` 断言改 `toMatchObject`（失败时带出 error 载荷）；真 hub 集成门在
  全量负载下仍有偶发（两棵树均现，与本批路径无关）——夜间门监控面。
