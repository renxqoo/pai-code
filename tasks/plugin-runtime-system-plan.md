# 运行时可插拔插件体系 · 实施方案（待定夺）

> 来源：plan 代理起草，两轮补齐（§0–§2 + M0–M5 + 安全/动态生效/可扩展/测试 + R1–R6）；评审后修订 v2。
> 目标诉求：① 插件管理页面；② 动态加载插件；③ **agent 可动态注册插件**；④ 插件**不必提前打包进 dist**（任意路径动态注册）；⑤ 动态注册、动态生效。
> 两仓：`agent-app`（Electron）+ `x-harness`（host-hub，检出 `feat/sandbox-srt`）。
> 状态：**已实施**（M0–M5 + M2 全量落地；两仓四门全绿：x-harness 2576 tests / agent-app 1958 tests；e2e 含动态插件场景通过）。
>
> **修订 v2（评审后，6 处）**：
> ① **P1** 装载模式强制不变式下沉：vendor 根路径恒 worker 模式——编排层覆写请求 mode + 引擎侧拒 vendor 路径 process 装载（双层防御）；manifest `kind` 字段仅作展示，不作强制依据（manifest 是插件作者写的，不可信）。
> ② **P2** R5 收紧：caps 可见面首版排除元能力 token（`pluginManagerService` 等装卸/内核事件 token）；审批语义明示——确认安装 = 授予 caps 可见面全部平台能力，UI 文案不得弱化。
> ③ **P3** source 枚举统一为 `builtin|vendor` 两值，原「third-party」区分改由 `origin:"manual"|"agent"` 数据字段承载；vendor 撞 builtin 名在 registry 写入层拒。
> ④ **P4** apiVersion 不匹配行为定义：装载拒 + registry 条目保留 + list 透出 disabled 原因，冒烟覆盖。
> ⑤ **S1** 里程碑重排：M2（打包修复）移出关键路径——dev/脚本拓扑下 worker 模式当天可用，功能链 M0→M1→M3→M4→M5 先行全跑通，M2 全程并行、独立验收。
> ⑥ **S2** 表述修正：`BUILTIN_PLUGINS` 词表基数当前为 1（token-analytics）；「20+」指 `packages/` 下经 `loadPlugins` 装载的内核插件件（不经词表）。

---

## 0. 事实核实结果（先于设计）

用户提供的事实**全部属实**，逐条核实锚点：

| # | 事实 | 核实锚点 |
|---|------|---------|
| 1 | token 按对象身份匹配 | `create-context.ts:189-191`（`Map<AnyToken,…>` + 注释「token 对象为键——同名不同 token 互不可见」）；`tokens.ts` `defineService` 返回 `Object.freeze({kind,name})`；`install.ts:158` collision 检查 |
| 2 | 参考实现 | `packages/token-analytics/src/token-analytics.ts`（`softInject:["llm"]`、`ctx.provide(tokenAnalyticsService,…)`） |
| 3 | 消费侧按名取 token | `worker-read-commands.ts:203-218`，缺席报 `capability_plugin` |
| 4 | 动态装载腿 | `external-plugins.ts` / `plugins-catalog.ts` / plugin-manager 全套（install 编排、`?pmv=`、audit、approveInstall 缺省全拒） |
| 5-6 | 双形态与打包缺陷 | `hub-paths.ts`、`sync-resources.ts`（仅 `--compile` 单文件）、`electron-builder.yml`（`files: out/**` + resources 两二进制，**无 node_modules**） |
| 7-8 | 契约面与 T42 模式 | `contracts/{commands,hub-commands,hub-data,hub-errors}.ts`、`settings/` 技能区 + `verbs/skills*.ts` + `main/skill-import.ts` |
| 10-11 | 安全红线与纪律 | `approval.ts` 缺省拒、词表注释、两仓 AGENTS.md 覆盖率 ≥90/85 |

**核实中发现的 5 个补充事实（直接影响取舍）：**

- **F-A｜worker 桥已是「按名桥接」的 70% 半成品**：`bridge.ts`/`worker/host.ts` 中，插件 provide 的服务经 `provided` 消息按名在 main 侧合成 token 注册；worker 内 `ctx.use(平台服务)` 走 svc-call RPC 代理。**但** worker 内插件 import 的 `@x-harness/*` 仍与 worker 内核共享模块实例（`worker/host.ts` 是真实文件、node_modules 链在场），且 worker 模式监听**仅限 emit**（waterfall/serial/guard/parallel 一律装载拒）。→ 路线 B 的桥接机制已存在 70%，缺的是「插件侧零 `@x-harness/*` import」的入口。
- **F-B｜`external-plugins.ts` 没传 `deps.tokens`**：`createPluginManager` 的 tokenTable 自举只含内核 6 个事件/服务 token，`systemPrompt/toolRegistry/sessionStore/llmRuntime` 都不在。process 模式现在能跑纯粹因为共享模块实例。**任何「按名重映射」方案都必须先补这张词表。**
- **F-C｜worker 模式在单文件形态天然坏**：`install.ts` 的 `hostPath = fileURLToPath(new URL("./worker/host.ts", import.meta.url))`——`bun build --compile` 后该文件不在磁盘，`new Worker()` 无从 spawn。**但这只影响打包形态：dev/脚本拓扑下 `worker/host.ts` 是磁盘真实文件，worker 模式当天可用（S1 重排的依据）。**
- **F-D｜PLUGINS.md 明确把本任务列为「不处理」的后续项**：「运行时管理面（`plugins/list|install|uninstall` 协议命令 + 审批 UI）」「词表外第三方路径装载」「worker（线程隔离）装载模式」三条全是本方案正文，文档说「本次词表封闭集即其地基」——**本方案是该文档既定续篇，不是推翻**。
- **F-E｜每 thread 一个 worker 进程**（`worker-pool.ts` slots per thread），每 worker 有独立 world ctx 和独立 pluginManagerService。「动态生效」必须明确作用域语义（见 §7）。

---

## 1. 架构决策：**A/B 混合，以 B 为第三方插件的目标形态**

### 结论
- **内置插件（词表内正式件 + 内核件）→ 路线 A**：保持现状（process 模式 + 共享模块实例），零契约变更。词表件（当前基数 1：token-analytics）与 `packages/` 下 20+ 内核插件件（经 `loadPlugins` 装载、不经词表）的既有写法全部沿用。
- **用户/agent 注册的第三方插件 → 路线 B**：`apply(ctx, capabilities)` 能力注入，插件**零 `@x-harness/*` import**，强制 **worker 模式**（线程隔离）装载。

### 理由（直面 token 身份约束）
**路线 A 对第三方插件有一个原理性不通的死结**：token 身份 = 模块单例，要求插件的 `import "@x-harness/core"` 解析到与宿主**同一 URL**。这只在「插件与宿主共享同一 node_modules 链」时成立（内置/monorepo 内插件——smoke-dist 已验证）。第三方插件放任意用户路径时：
- 裸说明符从**插件文件位置**向上解析，命中不了 x-harness 的 node_modules → 要么每个插件目录造 symlink farm（pnpm 式，脆弱），要么插件自 bundle SDK——**而 bundle 会产生新的 `defineService` 对象，token 身份分裂，`install.ts:158` 的 collision 检查直接 fail-closed 拒装**。A 在「任意路径 drop-in」上不是改动大小问题，是能不能的问题。

**路线 B 的机制恰好是既有 worker 桥的推广**（F-A）：worker 桥已证明「token 不跨线程、以名字过线、双侧各自解析」可行。B 把这层从「worker 专属」提为 plugin-manager 通用能力面：`capabilities` 是按名的受控 facade（`use/tryUse/waitFor/provide/on/emit`），装载时注入，token 解析全部收敛到 tokenTable 单点，插件侧只剩纯业务代码。

**为什么内置插件不迁 B**：`packages/` 下 20+ 内核插件件（含 plugin-api 的 transform/veto/tap 语法糖）建立在「真 token + 真 ctx」上，waterfall/guard 等有序派发在 worker 模式**被刻意不桥**（`bridge.ts` 审查 #3：跨线程洋葱语义不桥）。迁 B = 重写全部插件 + 能力面降级。混合让各取最优：内置拿全能力 + 零迁移，第三方拿隔离 + 零依赖。

### 「动态插件如何真正钩住世界、动态生效」机制
1. **钩住世界（B）**：装载时 plugin-manager 组装 `capabilities`，其 `use("session")` 内部 = `tokenTable.get("session")` → 真 token → `platformCtx.use(token)`。tokenTable 三方供血：内核自举（既有）+ **宿主注册的世界 token（本次补，F-B）** + 已装插件 provide 的 token（既有 `onToken` 回调）。同名异体仍由 `install.ts:158` fail-closed 拒。**caps 可见面 = WORLD_TOKENS − 元能力 token（`pluginManagerService` 及插件装卸/内核事件 token，P2）——第三方件不能经 caps 装卸插件。**
2. **动态生效**：`install` 成功即 `platform.provide(...)` 落 world root——`ctx.use` 链上即刻可见，无需重建 world/会话。工具注册与 systemPrompt section 都是 assemble 时现读，中途装载即时反映。`replace:true` 经 `?pmv=N` 拿新实例、同名锁内先卸后装。`uninstall` 回卷插件 scope + tokenTable 清理。
3. **跨 thread 传播**：清单文件 `<agentDir>/plugins/registry.json` 是新 worker 装载依据；已存在 thread 经 host→worker 转发命令在其 world 内热装/热卸（见 §7）。

---

## 2. 总体分层

```
┌─ 引擎层（x-harness，不动内核语义）──────────────────────────┐
│ core/context（token 身份注册表）· plugin-manager（装载编排、 │
│ 审批门、审计、registry 锁、worker 桥）                        │
├─ 平台 SDK / 能力面层（本次新增，两处）───────────────────────┤
│ ① plugin-manager: capabilities facade（B 路线注入面，        │
│    可见面排除元能力 token）                                   │
│ ② host-hub: plugins-admin（清单文件、第三方 vendor 根、      │
│    审批记录、plugins/* 命令、agentDir/plugins 目录治理）      │
├─ 插件层（不进 dist）────────────────────────────────────────┤
│ 内置插件：词表符号名 + node_modules 链（A，process 模式）     │
│ 第三方插件：任意源路径 → 审批 → 拷入 agentDir/plugins/vendor  │
│   → worker 模式装载（恒 worker，P1 不变式），零 @x-harness 依赖（B）│
└────────────────────────────────────────────────────────────┘
```

**「不进 dist、任意路径」的落法（对齐技能安装先例 `skills-install.ts`）**：第三方插件源路径只是**拷贝源**——经 inspect 形态检查（入口文件、manifest 形状、**无裸 `@x-harness/*` import 断言**）→ 用户/agent 发起安装 → 审批 → **全树拷入 `<agentDir>/plugins/vendor/<name>/`** → 从受控 vendor 根装载。approveInstall 白名单恒等于 vendor 根（+ 可选 dev root，仅 env 显式开、打包态禁用）。与 `skills-install.ts`「拷入用户技能根」完全同构，且天然守「settings/清单是数据不是代码」红线：registry.json 只记名字/来源/哈希/审批时间，装载时每条仍走哈希 pin + approveInstall，不是路径直装。

---

## 3. 分阶段实施步骤

### M0｜引擎：能力注入面 + token 词表（x-harness，纯增量）
| 做什么 | 文件 |
|---|---|
| capabilities facade：`use/tryUse/waitFor/provide/on/emit`（按名，tokenTable 收敛）；**可见面 = WORLD_TOKENS − 元能力 token（`pluginManagerService`、插件装卸/内核事件 token）——第三方件不能经 caps 装卸插件（P2）** | `packages/plugin-manager/src/capabilities.ts`（新） |
| 装载面接入：process/worker 两模式 install 时组装 caps，`plugin.apply(ctx, caps)`（第二参可选，老插件不破坏） | `install.ts`、`wrapper.ts`、`worker/host.ts`（bridged ctx 旁挂 caps） |
| 世界 token 词表注入缝：`CreatePluginManagerDeps.tokens` 已有，补宿主侧传参 + 内核常用 token 打包导出（`WORLD_TOKENS` 常量数组，防宿主散写漂移）；**元能力排除清单同处定义，单一真相** | `packages/plugin-manager/src/types.ts`、`apps/host-hub/src/worker/external-plugins.ts`（F-B 补账） |
| 第三方 manifest 校验：`{name, apiVersion, kind:"third-party"}` + **无 `@x-harness/*` import 静态检查**（`kind` 仅作展示/统计，不作模式强制依据——P1：不可信输入不进门） | `validate-module.ts` 扩展 |
| 测试 | `packages/plugin-manager/src/__test__/capabilities.test.ts`（新；含 **caps 面不含元能力 token 断言**） |

> **caps 本次做不做？——做，是需求 3/4/5 的硬前置**：第三方件零 `@x-harness/*` import，只能靠 caps 按名钩世界；纯 A 形态下任意路径件在 token 身份上原理性不通。M2 与 caps 无关且已移出关键路径（并行轨，见 M2）。若把 B 整体推后，本期只剩 M2 + 裁剪版 M3/M4（管理页只管 builtin 启停/热装/审计），需求 3/4/5 会一起落空。

### M1｜引擎：host-hub 管理面 + 装载腿（x-harness）
| 做什么 | 文件 |
|---|---|
| 插件清单文件（单一真相）：`<agentDir>/plugins/registry.json`——每条 `{name, source:"builtin"\|"vendor", origin?:"manual"\|"agent", path?(vendor 相对名), sha256, approvedBy:"user", approvedAt, apiVersion}`；读写/校验/哈希；**vendor 名 ∈ builtin 名集 → 拒写入（撞名在清单层拒，不留给 install 层 withNameLock 兜底——P3）** | `apps/host-hub/src/shared/plugins-registry.ts`（新，形态对齐 `settings-store.ts`：单点校验、坏文件丢弃） |
| 词表扩双源：`BUILTIN_PLUGINS`（不动）+ `vendorRegistry()`（运行时读清单）；`enabledBuiltinPlugins` 泛化为 `enabledPlugins`；**apiVersion 不匹配行为（P4）：装载拒（引擎 `kernelApiVersion` 门）+ registry 条目保留 + `plugins/list` 透出 `status:"disabled"` 与原因——宿主升级后旧件可见、可 remove/重装，不静默消失** | `apps/host-hub/src/shared/plugins-catalog.ts`（改，内置语义不变） |
| vendor 目录治理：`<agentDir>/plugins/vendor/<name>/`（安装目标）、`<agentDir>/plugins/.tmp`（半成品，装载器永不可见）、`<agentDir>/plugins/audit.jsonl`（既有） | 同上 + `apps/host-hub/src/host/plugins-install.ts`（新，抄 `skills-install.ts` 骨架：inspect 三态/install 拷贝+哈希+原子 rename/remove） |
| 装载腿升级：`roots = [vendor 根] ∪ builtin 解析路径 dirname`；`approveInstall = {builtin 精确路径集 ∪ vendor 根内路径且哈希过}`；**P1 双层防御——编排层（plugins-admin/worker 热装 handler）：vendor 路径一律覆写 `mode:"worker"`，无视请求参数；引擎层（install.ts）：vendor 根路径 + `mode:"process"` → 装载拒（不可信代码永不进主进程，即使编排层被绕过）** | `apps/host-hub/src/worker/external-plugins.ts`（改）+ `packages/plugin-manager/src/install.ts`（改） |
| host 管理命令：`plugins/list`（builtin+vendor+disabled+active 合并，含 apiVersion 不匹配原因）、`plugins/inspect`、`plugins/install`、`plugins/uninstall`、`plugins/set_enabled`、`plugins/remove`、`plugins/errors` | `apps/host-hub/src/host/plugins-admin.ts`（新）+ `admin-commands.ts`（注册，对齐 skills 六命令） |
| settings 扩键：`plugins.disabled` 校验从 `isBuiltinPluginName` 放宽到 `builtin ∪ 已装 vendor 名`；新增 `plugins.trustedSources?: {sourcePath, sha256}[]`（agent 注册暂存候选） | `apps/host-hub/src/shared/settings-store.ts`（改） |
| 协议路由：`THREAD_SCOPED_COMMANDS` 加 `plugins/hot_install`、`plugins/hot_uninstall`；`OBSERVER_COMMANDS` 加 `plugins/list` | `apps/host-hub/src/protocol/internal.ts`（改） |
| worker 命令面：热装/热卸 handler（`rt.state.world.ctx.use(pluginManagerService)` 直调；**热装 handler 内实施 P1 编排层覆写**）+ `get_state` 附近补插件状态快照 | `apps/host-hub/src/worker/worker-commands.ts`（改） |

依赖：M0 → M1（热装依赖 caps 就位才能装 vendor 件）。

### M2｜引擎：worker 模式编译态可用 + 打包修复（两仓交汇）——**并行轨，不在关键路径（S1）**
| 做什么 | 文件 |
|---|---|
| host.ts 落盘：`sync-resources.ts` 改双产物——`--compile` 单文件外，再产 `dist/` 多文件形态拷入 `resources/host-hub/dist/`；**插件运行时切 dist 形态** | `scripts/packaging/sync-resources.ts`（改） |
| node_modules 子集随包：`resources/node_modules/@x-harness/*`（只拷 host-hub 依赖闭包 + 插件词表声明的插件包；用 lockfile 推导） | `sync-resources.ts` + 新 `scripts/packaging/hub-deps.ts` |
| electron-builder 收资源 | `apps/electron/electron-builder.yml`（extraResources 增 dist 与 node_modules） |
| worker 桥 hostPath 修复：dist 形态下 `./worker/host.ts` 改为 dist 内对应 chunk（构建产物里 worker host 独立文件，运行时探测） | `packages/plugin-manager/src/install.ts`（hostPath 加形态分支） |
| hub-paths 三形态：脚本（dev）/ 直执行（编译）/ **dist+node_modules（插件宿主）**——插件在场时升级为 dist 形态（检测 `resources/host-hub/dist`） | `apps/electron/src/main/hub-paths.ts`（改） |
| 回归：dist 冒烟加「vendor 件 worker 模式装载 + 热替换」 | `apps/host-hub/src/__test__/smoke-dist.test.ts`（扩） |

> **S1 重排依据**：F-C 只影响打包形态——dev/脚本拓扑下 `worker/host.ts` 是磁盘真实文件，node_modules 链在场，worker 模式与整条功能链（装载/热装/热卸/管理页/agent 注册）当天可用。M2 与功能链无代码耦合（只动打包链与 hostPath 形态分支），故全程并行、独立验收（dist 冒烟锁死），失败不阻塞功能交付。第一个提交就用 dist 冒烟测试锁死（见 §10 最大风险）。
>
> 取舍：F-C 证明「内置/worker 插件在编译单文件形态下永远装不上」——**要么放弃单文件、要么放弃编译形态下的插件**。推荐放弃单文件作为默认形态（dist + 两个 extraResources 目录），单文件仅留「零插件裁剪版」。**需用户拍板（R1）——但配合 S1，R1 可在功能链验证后再定，不阻塞开工。**

### M3｜agent-app：契约 + API verbs + 主进程编排
| 做什么 | 文件 |
|---|---|
| 命令类型 `PluginsList/Inspect/Install/Uninstall/SetEnabled/Remove/HotInstall Cmd` + Data 形状 + `PAI_COMMAND_TYPES`/`COMMAND_NAMES` 封闭集扩员 + 错误码 `plugin_*` 族 | `packages/contracts/src/{hub-commands,commands,hub-data,hub-errors}.ts` |
| 视图 schema `PluginView{name,source:'builtin'\|'vendor',origin?:'manual'\|'agent',version?,enabled,status:'active'\|'failed'\|'disabled',disabledReason?,description?}`（**source 两值统一——P3**）、`PluginCandidateView` | `packages/contracts/src/api.ts`（zod） |
| verbs 域（批准根门、错误映射、零装载器规则镜像——同 skills.ts 纪律） | `packages/api/src/verbs/plugins.ts`（新）、`index.ts` 导出 |
| client 域方法 | `packages/api/src/client.ts`（`plugins:` 域） |
| 主进程接线（源发现：内置源根 + 手选目录，realpath 门） | `apps/electron/src/main/plugin-import.ts`（新）、`api-routes.ts`、`index.ts` |
| 热装编排（`plugins/hot_install` 转发 + 活跃会话 reopen） | `packages/api/src/verbs/plugins.ts` 内 |

### M4｜agent-app：插件管理页（渲染层）→ 见 §4

### M5｜agent 动态注册入口 + 安全闭环（两仓）→ 见 §5/§6

**依赖顺序（S1 重排后）**：关键路径 `M0 → M1 → M3 → M4 → M5`（dev/脚本形态全链可验）；**M2 全程并行、独立验收**，不阻塞任何功能里程碑。每步两仓各自四门全绿 + 覆盖率不降。

---

## 4. 插件管理页设计（照 T42 技能区 1:1 套）

**路由**：`settings-sections.ts` 加 `'plugins'` 进 `agent` 组（`permissions, agents, skills, plugins`）；`FETCH_ON_ENTER_SECTIONS` 加 `plugins`。文案 key 全进 `strings/{zh,en}-settings.ts`，组件零字面量。

**文件清单（一动词一文件、一 .tsx 一组件）**：
| 文件 | 职责（对应技能区同构件） |
|---|---|
| `settings/plugins-section.tsx` | 分区壳：搜索 + 导入按钮 + 刷新 + 卡片列表（≈skills-section） |
| `settings/plugin-import-dialog.tsx` | 导入对话框壳（≈skill-import-dialog） |
| `settings/plugin-import-content.tsx` | 候选列表/三态展示（≈skill-import-content） |
| `settings/plugin-remove-button.tsx` | 两步内联确认删除（≈skill-remove-button） |
| `settings/plugin-enable-switch.tsx` | 启停开关（若无复用价值直接用 `ToggleSwitch`，不建文件） |
| `live/plugins-actions.ts` | 动作组（≈skills-actions：refresh/setEnabled/scan/import/remove/hotInstall；chainPlugins 串行化；reopen 循环） |
| `store.ts` | 加 `plugins: readonly PluginView[]` |
| `use-settings-screen.ts` | 加 `plugins` 段 props 派生 |

**卡片信息面**：名称 + 来源徽章（builtin/vendor + origin 标记 agent 注册）+ 状态徽章（active/failed/disabled，disabled 附原因）+ 启停开关 + 删除（仅 vendor；builtin 只可禁用）+ 错误详情展开。状态驱动全经 `@paiapp/api` → 主进程 verbs → hub 命令；UI 只吃 `PluginView[]`，无协议字面量。

**审批文案（P2 硬约束）**：安装确认对话框必须明示「确认安装 = 授予该插件会话、工具注册、系统提示词、LLM 运行时等全部平台能力的访问权」，不得弱化为「添加插件」之类中性表述；显示插件将获得的能力面清单（caps 可见面枚举）。

---

## 5. agent 动态注册入口

**形态：hub 命令 + 暴露给 agent 的一个工具，两道门串联。**
- **命令**：`plugins/install`（带 `origin:"agent"` 发起方标记）+ `plugins/inspect`（agent 预检自己的插件目录）。
- **agent 工具**：`plugin_propose`（`worker-commands.ts` 工具面注册）：参数 `{sourcePath, manifest:{name,description,apiVersion}, requestedCapabilities: string[]}` → `{status:"pending_approval", proposalId}` 或 `{status:"rejected", reason}`。
- **安全门（不可绕过链）**：
  1. agent 把插件写到工作目录（bash 工具，受既有 permission/fence 管）；
  2. `plugin_propose` **只登记**：哈希源目录 → 写 `plugins.trustedSources` 暂存 → 发 `ui_request`（`dialogs.ts` confirm 桥，5min 超时默认拒）；
  3. 用户 UI 确认（**P2 文案**：明示能力授予范围）→ `plugins/install` 以 `approvedBy:"user"` 落 registry → 拷 vendor → 热装；
  4. **approveInstall 恒拒 agent 直接路径**：只认 vendor 根内 + registry 哈希匹配，origin 为 agent 的 install 必须携带已确认的 proposalId——agent 无法凭装载命令自己执行任意代码。
- **关键不变式**：agent 可触达的面（propose/settings 写）都只产**数据**；唯一代码执行口是 `pluginManagerService.install`，其门（roots + approveInstall + validateModule + **P1 模式强制**）在 x-harness 侧，agent-app 与 agent 都改不动。
- **契约**：`PluginProposeToolInput/Output` 住 `packages/contracts`；hub 侧 `plugins/trusted_source/list|confirm|reject` 三命令。

---

## 6. 安全边界落地点

| 边界 | 文件 |
|---|---|
| 准入：缺省全拒审批门 + vendor 根/哈希 pin | `plugin-manager/src/approval.ts`（不变）、`external-plugins.ts`（approveInstall 实现） |
| 准入：manifest + 无 SDK import 校验 + apiVersion 门 | `plugin-manager/src/validate-module.ts` |
| **模式强制（P1）：编排层覆写 vendor→worker + 引擎层拒 vendor 路径 process 装载（双层）** | `plugins-admin.ts`/`worker-commands.ts`（覆写）、`install.ts`（拒绝） |
| 沙箱：第三方件恒 worker 模式（线程隔离 + 双超时击杀 + 监听收窄 emit-only） | `install.ts`、`bridge.ts` |
| **能力面收敛（P2）：caps 可见面排除元能力 token；审批 = 授予可见面全部能力的语义明示** | `capabilities.ts`、§4 审批文案 |
| 审计：install/uninstall/failed/killed/apiVersion 拒载 + proposal 确认事件 落 JSONL | `error-log.ts`（扩 entry kind）、`plugins-admin.ts` |
| 信任边界：settings/registry 是数据不是代码；**vendor 撞 builtin 名清单层拒（P3）** | `plugins-catalog.ts` 注释口径、`plugins-registry.ts` |
| agent 面：propose ≠ install，confirm 归 UI | §5 链条 + `dialogs.ts` confirm 桥 |
| dev root 后门：`HUB_PLUGIN_DEV_ROOTS` 仅脚本形态、打包态拒 | `external-plugins.ts` |
| 输入围栏：绝对路径 + 无控制字符 + realpath 越界拒（抄 skills-install） | `host/plugins-install.ts` |

---

## 7. 动态生效机制

- **热替换**：`replace:true` → 同名锁内先卸后装 → process 件 `?pmv=N` bust 新实例；worker 件每次新 worker 天然新实例（host.ts 头注，**不加 query**——粘性失败坑）。
- **`plugins.disabled`**：装配期快照语义保留（重开生效）；对活跃 thread 用 `plugins/hot_uninstall` 即时卸。两态并存写清：disabled = 下次装配不装；uninstall = 立即卸 + registry 清条目。UI 开关分叉（builtin 走 disabled；vendor 走 hot_uninstall + remove）。
- **卸载时序**：`teardownWorld` 先行 uninstall（失败仅告警不短路）；热卸 = `withNameLock` + 依赖检查（`dependentsOf` 非空未 force 拒）+ scope 回卷 + tokenTable 清理。收殓窗口消费侧 `tryUse` 兜 `capability_plugin`。
- **跨 thread 传播**：每 live worker 独立 world——安装后其他 thread 不自动感知。策略：host 广播 `plugin_changed` → 各 worker 自查 registry 增量热装/热卸；失败降级「下次重开生效」。**需在 `worker-pool.ts` 加广播通道（帧分类/事件桥同步扩——`frame-classify.ts`、`event-bridge.ts`）。**

---

## 8. 可扩展性

- 新内置插件 = `BUILTIN_PLUGINS` 加一行 + 依赖树加包（词表单一真相扩容）；
- 第三方件按 name 独立目录隔离在 vendor 根，token collision fail-closed 兜底；
- `requestedCapabilities` 未来升级为按能力授权（最小权限），本次只声明+审计——**但元能力排除（P2）首版即做，不可后置**；
- plugin-api 的 transform/veto/tap 语法糖未来可为 B 路线出 `capabilities.use("session")` facade 版，本次不做。

---

## 9. 验证与测试

- **x-harness**：`capabilities.test.ts`（facade 全方法 + tokenTable 收敛 + collision 拒 + **caps 面不含元能力 token**）；`plugins-admin` 命令测试（HOME 注入缝隔离）；`smoke-dist.test.ts` 扩「vendor 件 worker 模式 + 热替换 + 卸载后 capability_plugin + **apiVersion 不匹配拒载留痕（P4）**」；`plugin_changed` 广播回归；覆盖率 ≥90/85 不降。
- **agent-app**：contracts 对拍测试（命令封闭集计数锚，两仓镜像）；`verbs/plugins.ts` 单测（错误映射矩阵）；管理页组件测试（props 驱动、无协议字面量）；打包产物冒烟（dist 形态起 host + 装插件，CI 校验 node_modules 子集完整）。
- **安全回归**：agent propose 未确认 → install 拒；哈希不匹配 → 拒；roots 外路径 → 拒；worker 件监听 waterfall → 装载拒；**vendor 路径请求 `mode:"process"` → 装载拒（P1——编排层与引擎层各测一条）；vendor 名撞 builtin 名 → registry 写入拒（P3）；caps 枚举不到 `pluginManagerService`（P2）**。

---

## 10. 风险与未决点（需用户拍板）

| # | 决策点 | plan 建议 | 用户倾向 |
|---|---|---|---|
| **R1** | **放弃编译单文件作为默认打包形态**（改 dist+node_modules，包 +30~60MB，单文件留零插件裁剪版） | 接受（F-C 力挺；**S1 后不阻塞开工，功能链验证后再定**） | ☐ |
| **R2** | agent 注册授权：每次 propose 弹确认 vs 会话内信任记忆 | 首版逐次确认（最严），记忆后置 | ☐ |
| **R3** | 改 PLUGINS.md 契约为 `apply(ctx, caps)` 双参（第二参可选） | 改（需求 3/4/5 前提） | ☐ |
| **R4** | 跨 thread 传播：广播 `plugin_changed` 自动热装 vs 提示重开 | 做广播，失败降级提示 | ☐ |
| **R5** | `requestedCapabilities` 首版强制授权？ | **否，只声明+审计；但审批语义 = 授予可见面全部能力须明示（P2），元能力 token 排除首版即做** | ☐ |
| **R6** | 第三方插件源范围 | 仅手选目录 + agent propose（攻击面最小） | ☐ |

**最大风险**：M2 的 node_modules 子集推导（lockfile 闭包）+ worker hostPath 形态分支——唯一动既有打包链的步骤，建议第一个提交就用 dist 冒烟测试锁死，失败早暴露。**S1 重排后该风险已被隔离在并行轨，不阻塞功能交付。**

**范围边界提醒**：若把 B（caps/第三方）整体推后，需求 ③④⑤（agent 动态注册 / 不预打包 / 动态生效）会一起落空，本期只剩「打包修复 + builtin 管理页」。若要满足全部 5 条诉求，R3（改契约做 caps）是必选项。
