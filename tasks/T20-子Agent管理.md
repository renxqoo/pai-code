# 子 Agent 管理（作用域 + 增删改 + 模型/工具配置） 方案

> 状态：已实施（四门全绿 756 测试；真机表单/校验/失败路径走查通过，跨进程写路径 E2E 待 dev 重启后用户一键完成——运行中 dev 实例主进程为旧代码，表单数据已保留在界面）
> 级别：中
> 参考稿：`setting-png/子智能体-01-列表页.png`（搜索/计数/刷新/新建 + 卡片列表）、`子智能体-02-编辑表单.png`（编辑 ui-coding：名称/描述/模型/工具/提示词/开关）、`子智能体-03-新建表单.png`（面包屑「子智能体 › 新建子智能体」同款表单）——UI 按 1:1 还原
> 前置审计：Pai 侧（agent/list 链路/agent-dir-files 白名单/AgentView）+ hub 侧（agent-definitions.ts 机制/协议边界）双审计已完成，结论入「契约」

## 契约（基于两侧审计的裁决）

- **零 hub 协议变更、零 hub 代码变更**：hub 对 agent 定义只有只读枚举（`agents/list`）与热发现（每次 task/agents/list 现读目录，写文件即生效、零重启零重开会话）→ 增删改 = app 侧直接读写定义文件
- **定义文件格式**（hub 单一真相 `agent-definitions.ts`）：markdown + YAML frontmatter `{name, description, tools?, model?}`，正文 = systemPrompt；`tools` 块列表 / 逗号串 / flow 数组三形态（不写 = 不设白名单 = 全部内置工具；未知名静默忽略，无通配符）；`model` 不写 = **运行期继承父对话模型与思考档**（解析失败也回退父模型）
- **作用域**（hub 原生语义，需求 1 直接映射）：
  - `user`（用户/全局）= `<agentDir>/agents/<name>.md`，所有项目可用
  - `project`（指定项目）= `<项目>/.pi/agents/<name>.md`，仅受信会话加载，同名覆盖 user 级
- **「继承父级 agent」的实现裁决**：hub 无定义级 extends（全仓确凿）→ 实现为运行期继承语义的显式化——模型下拉首项「继承父级」（不写 `model`）、工具不选全默认（不写 `tools`）。定义级 prompt 组合需 hub 先支持，挂账（见不处理）
- **CRUD 路由（app 侧文件面，全走主进程白名单原子写）**：
  - `agent/definitions`（枚举）：主进程本地扫描 `agentDir/agents` + 已知项目目录集合（会话注册表 cwd ∪ 活跃会话）的 `.pi/agents`，**不经 hub**（管理面需要 systemPrompt 原文与文件真相；hub 枚举不回传这些且 project 级受 trusted 门禁）
  - `agent/upsert`（新建/编辑/改名/移动统一）：写新文件 + previous 键位文件存在则删除；原子写（tmp+fsync+rename）；audit
  - `agent/remove`：按 file 键位删白名单文件；audit
- **旧链删除（实施裁决）**：hub `agents/list` 透传链整体移除（contracts AgentView 与 'agent/list' 方法、adapter agentViews、api-routes 路由、controller.refreshAgents、store.agents）——管理面单一真相 = 主进程文件枚举；hub-protocol.ts 的 `agents/list` 命令镜像保留（协议事实）。会话运行时的 agent 可见性由 hub 在每次任务调用时自行热发现（Pai 不镜像该视角）
- **身份键 = 文件名主干（file）**（对抗审查 major 根治）：hub 只认 frontmatter name，手写文件 name 可与主干不等 → AgentDefinition 携带 `file`（枚举填充）；remove/upsert-previous 按 file 定位旧文件（宽松 stem 校验：无分隔符/非点开头）；upsert 新文件主干恒 = name（pattern 内），编辑手写文件即归一到「主干=name」不变式
- **解析器覆盖 hub 合法全集**（对抗审查 major 根治）：flow 数组 tools（`[a, b]` / `[]`）、无引号标量尾注释（` #` 起剥，引号内 # 是内容）、BOM、栅栏行尾空格、symlink 定义文件、任意非空字符串 name（pattern 门禁只在写路径）；store 枚举含符号链接文件（hub isFile ∥ isSymbolicLink 同语义）
- **安全门禁**：
  - name → 文件名：文件名安全必要集（无 `/ \ : * ? " < > |` 与控制字符、非点/空白开头结尾、≤64 字符；空格与任意 Unicode 放行——hub frontmatter name 本无约束），构造上排除路径逃逸；文件名恒为 `<name>.md`
  - project 写入：cwd 必须 ∈ 已知项目集合；子路径固定 `.pi/agents`（不向上层目录搜索，写指定目录本身）；仅 `.md` 白名单后缀
  - 全部写/删动作 `deps.audit(...)`（permission_write 先例）
- **契约新增**：`packages/contracts/src/agents.ts`（`AGENT_TOOL_IDS` 内置工具 id 常量、`isValidAgentName`、`AgentScope`）；`AgentDefinitionSchema`（name/description/systemPrompt/tools nullable/model nullable/scope/project nullable/file 枚举填充）+ 三方法 schema（api.ts）

## 问题域

- 处理：
  - 列表页（参考稿 01）：搜索（名称/描述）、计数、刷新、新建按钮；卡片 = 图标 + 名称 + 作用域徽章 + 描述 + model/tools 摘要 + 编辑/删除（两步确认）；按作用域分组（用户级 / 项目级）——设计稿「已安装/内置」分组映射为我们的数据面分组
  - 表单页（参考稿 02/03）：面包屑（子智能体 › 名称 / 新建子智能体）+ 返回；字段：名称（新建可编辑/编辑可改名）、描述、系统提示词（多行）、模型下拉（modelOptions + 「继承父级」首项）、工具两段模式（「默认所有工具」隐藏工具列表 / 「自定义工具」展开多选，自定义须至少选一个）、作用域（新建可选 用户/指定项目 + 项目下拉；编辑可改 = 文件移动）
  - 列表态 ↔ 表单态为分区内部 UI 状态机（不进分区路由/不进 store）
- 不处理（挂账）：
  - **定义级继承（extends 组合父 agent 的 prompt/tools）**：hub frontmatter 无该字段且静默忽略未知字段，需 hub 仓库先行支持；本任务的「继承父级」= 运行期继承语义（上文裁决）
  - **agent 启用/禁用开关**（参考稿卡片带开关）：hub 无 enabled 概念，禁用 = 删文件语义不清；卡片操作为 编辑/删除，开关不还原（偏差已声明）
  - 参考稿「内置/已安装」计数分组、诊断横幅、「+ 新建」旁的下拉（用户切换）：无数据面，不还原
  - project 级写入只覆盖「已知项目集合」（注册表 + 已保存会话）；任意路径手输不做（安全面收窄）
  - hub「最近上溯 .pi/agents」语义：Pai 只写指定项目根的 `.pi/agents`，编辑已有上溯目录中的定义不支持（列表也只枚举已知项目根）

## 并发/一致性预算

- 定义文件无锁多写者（用户手改 vs app）：编辑器用分区进入时的枚举快照（无单独 read 面），保存时整体覆盖写、frontmatter 由 app 序列化——用户手改的额外 frontmatter 字段会丢失，接受：app 是这些文件的管理属主
- upsert「写新删旧」两步非事务：先写新文件成功再删旧文件（previous 按 file 定位），删除失败 → 留双文件（同名时 hub 按 name 去重/覆盖，下次编辑仍可达），失败原因回传
- 枚举为快照读，无 watcher；刷新按钮 + 写操作后主动重拉；knownProjects（渲染层 = 已保存会话 cwd 去重）与主进程已知集合存在极小的时序窗（注册表行在快照后被移除 → 提交被 invalid_project 拒，设置页为模态窗口极小，挂账接受）

## 拆分

逻辑层（主 agent）：

| 文件 | 职责 |
| --- | --- |
| `packages/contracts/src/agents.ts` | AGENT_TOOL_IDS/isValidAgentName/AgentScope（工具 id 词表与文件名安全校验的单一真相） |
| `packages/contracts/src/api.ts` | AgentDefinitionSchema + agent/definitions·upsert·remove 方法 schema |
| `apps/electron/src/main/agent-definition-file.ts` | md 编解码纯函数：parseAgentDefinition(text) / serializeAgentDefinition(def)（frontmatter YAML 手写序列化，数组 tools） |
| `apps/electron/src/main/agent-definitions-store.ts` | 枚举（user 目录 + 已知项目 .pi/agents）/read/upsert（写新删旧）/remove + 路径解析门禁（name pattern、项目集合、固定子路径、.md 后缀）+ 原子写 |
| `apps/electron/src/main/api-routes.ts` | 三路由 + audit + 已知项目集合装配（registry ∪ saved） |
| `apps/electron/src/renderer/src/live/store.ts` | `agentDefinitions` 字段 |
| `live-controller.ts` / `workspace-actions.ts` | refreshAgentDefinitions/upsertAgentDefinition/removeAgentDefinition（失败 notice） |
| `settings/use-settings-screen.ts` | agents 组 props 扩展（definitions/knownProjects/modelOptions/toolIds/回调，键位 file） |
| `packages/adapter/src/{response-views.ts,index.ts}` | 删除 agentViews 视图（随 hub 透传链移除） |
| `strings/{zh,en}.ts` | 新 key（表单/校验/确认/分组/空态） |
| 各 `__test__` | 编解码、store 门禁与原子写、路由安全（逃逸/非集合项目/audit）、controller、组件冒烟补 |

UI 层（ui-coding 子 agent，按参考稿 1:1）：

| 文件 | 职责 |
| --- | --- |
| `settings/agents-section.tsx` | 重写：列表态（搜索/计数/刷新/新建 + 分组卡片）↔ 表单态状态机 |
| `settings/agent-definition-form.tsx` | 新建/编辑表单：面包屑 + 六字段 + 保存/取消（校验：必填/name pattern/重名） |

## 实施顺序

| # | 步骤 | 门 |
| --- | --- | --- |
| M1 | contracts + strings + AgentDefinition 类型面（UI agent 的依赖先冻结） | typecheck |
| M2 | UI 层（子 agent 按稿） | 四门 |
| M3 | 逻辑层（store/routes/controller/actions/接线）+ 测试 | 四门 |
| M4 | 真机走查 + 对抗审查 + 收口提交 | 偏差清零 |

## 实施记录

- 旧链删除：hub `agents/list` 透传链整体移除（contracts AgentView/'agent/list'、adapter agentViews、api-routes 路由、controller.refreshAgents、store.agents、use-live-workspace.agents）；hub-protocol.ts 的命令镜像保留（协议事实）；管理面单一真相 = 主进程文件枚举（agent/definitions）
- 渲染层 knownProjects = 已保存会话 cwd 去重（saved 由主进程已知集合门控生成，故 UI 可选项 ⊆ 主进程接受集；注册表时序窗挂账见并发预算）
- 新增用例：编解码 7 + store 门禁/生命周期 9 + api-routes 安全面 1 + contracts 三方法 2 + controller 管理面 1 + 表单冒烟 3；全量 758 pass / 0 fail
- 真机走查（dev HMR）：表单六字段/工具词表/作用域分段/校验呈现/保存失败内联（旧主进程无新路由时的失败路径 UX）✓；写路径 E2E 需主进程重启（electron-vite watcher 未自动重启运行中实例），表单数据已保留在界面，重启后点保存即可完成
- 对抗审查（独立会话，hub 真实 frontmatter 解析器实证写契约）：2 major 已根治（flow 数组/尾注释解析损坏 → 解析器覆盖 hub 全形态；name≠主干操作错位 → 身份键改 file 主干）；minor 处置——工具默认集文案事实修正（不写 tools = 全部内置工具）、注释协议字面量改写、store.read 死代码删除、原子写补 fsync、测试注释如实、文档漂移修订（本节与契约节）、pinned-section 空白误触恢复

## 验收清单

- [ ] 列表/表单与参考稿 1:1（像素对照待用户目验）；已声明偏差（无开关/分组语义）不出现
- [ ] 新建：user 与 project 作用域各建一个 → 文件落位正确（`agentDir/agents/*.md`、`<项目>/.pi/agents/*.md`）→ agents/list 与会话 task 立即可见（零重启）
- [ ] 编辑：改描述/模型/工具/prompt/改名/改作用域（移动文件）→ 旧文件清理
- [ ] 删除：两步确认 → 文件删除
- [ ] 继承父级：模型选「继承父级」/工具全不选 → frontmatter 无 model/tools 字段 → hub 运行期继承语义
- [ ] 安全面：name 逃逸/非集合项目/非 .md 一律拒绝；写删动作全 audit
- [ ] 四门全绿 + 覆盖率不降 + 对抗审查偏差清零
