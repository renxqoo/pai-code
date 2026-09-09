# 模型选择统一 CommandDialog 方案

> 状态：已实施（对抗审查问题清单已处置；真机走查弹窗交互待用户完成）
> 级别：中
> 参考稿：shadcn `CommandDialog`（CommandManyItems）示例——居中模态 + 顶部搜索输入 + 分组列表 + 空态，键盘上下/回车选择内建
> 分工：UI 层 = ui-coding 子 agent（M2）；逻辑层/接线/测试/收口 = 主 agent（M1/M3）

## 契约

- **新增 shadcn 生成组件** `apps/electron/src/renderer/src/components/ui/{command,dialog}.tsx`（`bunx shadcn add command dialog`，base-nova 风格，cmdk 依赖由 CLI 注入 apps/electron）
- **新增通用选择弹窗** `components/picker-dialog.tsx`：

  ```ts
  type PickerDialogItem = { id: string; label: string }
  type PickerDialogGroup = { heading?: string; items: readonly PickerDialogItem[] }
  type PickerDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string                    // 对话框标题（可访问名）
    searchPlaceholder: string
    emptyLabel: string
    groups: readonly PickerDialogGroup[]
    selectedId: string | null
    onSelect: (id: string) => void   // 选中即回调并关闭
  }
  ```

  行为：cmdk 跨组模糊过滤；过滤后无可见条目 → emptyLabel；Esc / 点遮罩关闭（Base UI Dialog 默认）；选中项渲染勾选标记；选中 → `onSelect(id)` + 关闭。不渲染 CommandShortcut（选择器场景无快捷键语义）。`defaultValue=selectedId` 让初始键盘高亮落在当前选中项（打开即回车不会误提交目录首项/清空默认模型）；关 = 卸载（搜索词随之重置 = 重新打开呈现全量列表；退出过渡不做——生成物 sr-only 标题在 Portal 外，常挂载会污染关态 DOM，保关态零渲染优先）。
- **新增模型分组纯函数** `components/group-model-options.ts`：`groupModelOptions(options: readonly string[]): PickerDialogGroup[]`
  - `"provider/modelId"` 按首个 `/` 前的前缀分桶，桶序 = 首现序；组内条目 label 去前缀、id 保留全串（回调语义不变）
  - 无 `/` 条目落入同一个无标题桶；全列表无前缀时 = 无标题单组（视觉等价平铺）
- **strings** 新增顶层节 `modelPicker: { title, searchPlaceholder, empty }`（en 先行，zh 类型强制对齐；三调用点共用）
- **三调用点**（对外回调签名全部不变）：
  | 调用点 | 文件 | sentinel 首组 | 回调 |
  | --- | --- | --- | --- |
  | 输入框底行模型选择 | `composer/composer-actions-row.tsx` | 无 | `onSelectModel(全 id)` |
  | 设置 · 默认模型 | `settings/providers-section.tsx` | `{ id: '__none__', label: defaultModelNone }` | `onSelectDefaultModel(id === '__none__' ? null : id)` |
  | 设置 · agent 表单模型列 | `settings/agent-definition-form.tsx` | `{ id: '__inherit__', label: agentsModelInherit }`（沿用既有保留 id） | `setModel(id === '__inherit__' ? null : id)` |
  - 默认模型 sentinel 从「文案当 id」改为保留 id `__none__`（双下划线前缀与 `__inherit__` 同款约定，杜绝与真实模型名撞车）
  - 触发器外观保持各处现状（composer 胶囊 / 设置 select 观感 / 表单全宽字段），点击行为 = 打开对话框（`aria-haspopup="dialog"`）
- **删除**：三处模型 `MenuButton` 用法。effort / 权限模式 / project 选择 / provider 表单等其余 MenuButton 与 MenuButton 组件本身全部保留

## 问题域

- 处理：三处模型选择下拉统一替换为 CommandDialog 通用组件；触发器外观不变；选择语义（含 sentinel 归一）不变
- 不处理：
  - effort（推理档位）、会话权限模式、project 选择、provider 表单 thinkingFormat 等下拉——非模型选择，保留 MenuButton（归属：后续如需统一再立项）
  - provider 表单内模型目录编辑（`provider-form.tsx`）——是清单编辑不是选择弹窗
  - composer 无模型引导按钮（`noModelsLabel` → onOpenSettings）——保留原路径
  - CommandShortcut 快捷键列——无语义，不渲染
- 并发/一致性：无新面（弹窗开合为组件本地 state；模型清单为 store 只读快照）

## 拆分

UI 层（ui-coding 子 agent，M2）：

| 文件 | 职责 |
| --- | --- |
| `components/ui/command.tsx`、`components/ui/dialog.tsx` | shadcn 生成（base-nova），不手改结构 |
| `components/picker-dialog.tsx` | 通用选择弹窗（上文契约 API） |
| `components/group-model-options.ts` | 模型分组纯函数 |
| `composer/composer-actions-row.tsx` | 模型触发器改开对话框（effort 菜单不动） |
| `settings/providers-section.tsx` | 默认模型触发器改开对话框（含 `__none__` 首组） |
| `settings/agent-definition-form.tsx` | 模型列触发器改开对话框（project 菜单不动） |

逻辑层（主 agent，M1/M3）：

| 文件 | 职责 |
| --- | --- |
| `strings/{en,zh}.ts` | modelPicker 节（UI 依赖先冻结） |
| 三调用点 | 接线核对（sentinel 归一、回调映射、触发器禁用态） |
| `components/__test__/group-model-options.test.ts` | 表驱动：前缀分组/首现序/无前缀桶/label 去前缀/id 保完整/空输入 |
| `components/__test__/picker-dialog.test.tsx` | 静态冒烟：关态不渲染面板；开态渲染标题/搜索/分组/选中勾/空态文案 |
| 三调用点 `__test__` | 既有冒烟回归 + 关态不含弹窗内容断言 |

## 实施顺序

| # | 步骤 | 门 |
| --- | --- | --- |
| M1 | 方案 + strings（UI 依赖冻结） | typecheck |
| M2 | UI 层（ui-coding 子 agent） | 四门 |
| M3 | 接线核对 + 测试补齐 + 对抗审查 + 收口提交 | 四门 + 覆盖率 |

## 裁决

- **用户裁决**：弹窗形态 = 用户提供的 CommandDialog 示例（居中模态 + 搜索 + 分组）；范围 = 所有模型选择弹窗（用户点名「默认模型、输入框左下角」两处 + 全仓探查补齐第三处 agent 表单模型列）；分工 = ui-coding 子 agent 先改 UI，主 agent 最终接逻辑
- 默认裁决（否决窗口）：
  - 组件落 app `components/`（shadcn 生成物的家，`button.tsx` 先例；packages/ui 是手写 base-ui 组件的家）；三个调用点全部在本 app 渲染层，不跨包复用
  - 模型按 provider 前缀分组、条目 label 去前缀（组标题承载 provider；id 恒为全串）
  - 默认模型 sentinel 改保留 id `__none__`
  - 交互测试受限于仓库零 mock / renderToStaticMarkup 口径：行为逻辑（分组、sentinel 归一）下沉纯函数单测，组件开/关态静态冒烟，弹窗内键盘/过滤交互依赖 cmdk 库自身测试 + 真机走查（仓库既有口径，T20 同款）

## 测试口径

- 契约断言：groupModelOptions 表驱动（分组/序/前后缀/空）；PickerDialog 关态零渲染、开态全要素（标题/搜索占位/组标题/条目/唯一选中勾/空态文案）
- 边界：空 modelOptions（composer 引导按钮路径不弹窗；设置/表单仅 sentinel 组）、selectedId 不在列表（无勾但不崩）、`__none__`/`__inherit__` 与真实模型 id 同现不串
- 回归：既有 settings/composer/agent-form 冒烟全绿（触发器文案不变是回归锚点）
- 分层：单元（纯函数 + 静态冒烟）——无跨进程面，不建 e2e

## 对抗审查处置（M3，独立会话审查：无 major，6 minor + 2 question）

- 修：组 key 弃 `heading ?? untitled-N`（provider 名是自由文本可撞车）改 `groupIndex`
- 修：条目 `aria-label={item.id}`——展示 label 去 provider 前缀后，访问名补全完整 id（对齐旧菜单可听性；选中态 sr-only 文案超出旧实现同等水平，挂账为后续增强）
- 修：`defaultValue={selectedId}` 初始高亮对齐当前选中（否则「打开即回车」会把 composer 模型切成目录首项 / 把默认模型清成 `__none__`）
- 修：providers 默认模型行包裹 span→div（弹窗 sr-only 标题 div 嵌 span 非法）
- 修：测试补契约断言——勾显隐位置契约（自绘勾非末位 svg + 条目带隐藏选择器）、条目访问名、composer 触发器冒烟（回归锚点此前无测试）、providers/agent-form 关态零渲染断言
- 驳回：早退卸载改常挂载交 Base UI 管过渡——生成物 CommandDialog 的 sr-only DialogHeader 在 Portal 外，常挂载会污染关态 DOM；搜索词随卸载重置是选择器期望行为，退出过渡损失可接受（已在 picker-dialog.tsx 注释落档）
- 接受：无模型且无引导回调的空触发器退化形态（与旧 MenuButton 完全同形）

## 验收清单

- [x] 三处模型弹窗均为 CommandDialog 通用组件（搜索/分组/键盘可达），触发器外观与既有一致（弹窗内交互真机走查待用户）
- [x] 对外回调签名零变化（onSelectModel / onSelectDefaultModel / setModel 归一语义不变）
- [x] sentinel `__none__` / `__inherit__` 归一正确，文案不再当 id
- [x] 其余 MenuButton 用法与 MenuButton 组件不受影响
- [x] 四门全绿：lint 0/0（395 文件）、typecheck、build exit 0、852 pass / 0 fail；覆盖率（bun 1.4.2 不强制 bunfig 阈值，如实报告）：全局 funcs 71.04% / lines 81.40%（处置补测前 70.75/81.35，只升不降）；本功能文件 group-model-options 100/100、picker-dialog-items 75f/100l、picker-dialog 50f/88.24l（未覆盖 = pick 回调闭包，与 packages/ui menu-button.tsx 50f 同款静态口径局限）；shadcn 生成物五文件进入计量面（command 60.9l / dialog 65.7l / input-group 36.9l / input 28.6l / textarea 25.0l，生成目录）
- [x] 对抗审查问题清单清零（见上节处置）
- [ ] 提交：composer-actions-row.tsx / strings en+zh / bun.lock 混有并行在途未提交变更（sendMode 移除、排队消息 strings 等），按仓库纪律留待协调后提交；其余本功能文件（components/**、providers-section、agent-definition-form、两测试、.oxlintrc.json、apps/electron/package.json、T21 文档）为纯本任务改动
