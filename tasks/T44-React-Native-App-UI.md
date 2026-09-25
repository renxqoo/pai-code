# Pai Code React Native App UI 方案

> 状态：待对抗审查
> 级别：大
> 范围：`apps/mobile`

## 1. 目标

在 monorepo 的 `apps/mobile` 新增生产级 Expo 应用，交付 Pai Code 的完整移动端 UI 与本地交互。界面沿用桌面端黑白中性色、细边框、克制阴影与橙色生成态；参考图片仅用于理解工作空间、对话历史、设置和发送任务的信息层级，不复制其图标、布局、文案与视觉细节。

## 2. 外部契约

- Expo SDK 57 官方支持矩阵，React Native 0.86.3，React 19.2，TypeScript strict。
- Expo Router 管理页面；`apps/mobile/app/` 中每个路由文件保持单一页面职责。
- Zustand 是唯一 UI 状态真相，按导航、会话、输入、历史、附件、设置分域。
- 系统附件接口只返回展示所需的名称、类型、大小和本地 URI；取消或失败收敛为空态，不崩溃。
- 所有页面和组件支持 iOS、Android，遵守系统安全区、键盘、返回手势和无障碍语义。

## 3. 问题域

### 处理

- 对话首页、空态、消息、思考、执行步骤、代码块、权限确认。
- 多行 Composer、发送/停止状态、附件、模型、思考档、权限模式、上下文用量。
- 移动端历史抽屉、搜索、时间分组、项目分组、会话操作。
- 工作空间选择和连接电脑入口的展示交互。
- 模型管理、用量、归档、搜索结果、个人资料、外观、语言、默认偏好、通知、触感、隐私、安全、帮助、关于。
- 主题、触控反馈、界面本地状态和演示数据。

### 不处理

- host-hub 连接、模型请求、流式生成、持久化和真实账号认证由后续应用服务层负责；当前仅维护可替换的演示数据与 UI 状态。
- 不修改 Electron 渲染层、共享契约或主进程行为。
- 不在 UI 中保存 API key、凭据或敏感文件内容。
- 不提供发布、推送、签名和商店配置。

## 4. 设计基线

- 设计 token：中性背景、近黑主文字、弱化边框、深浅主题、单一橙色生成强调色。
- 组件层级：底层 `components/ui`、领域 `components/*`、页面 `features/*`、路由 `app/*`。
- 移动端节奏：16 页边距、12 网格间距、44pt 最小触摸目标、紧凑列表、底部安全区。
- 面板：居中短内容用 Sheet；长表单与历史用全屏页；不照搬参考图的超长空白和巨型标题。
- 图标：统一 Lucide 线性图标，避免混用参考图中的拟物图形。
- 动效：Reanimated 160–280ms，尊重系统 Reduce Motion；同一时刻只允许一个主 Sheet。
- 文本：用户可见文案集中在 `src/strings/zh.ts` 与类型目录；中英文 locale 仅使用当前中文交付，不保留未实现双轨。

## 5. 组件与文件约束

- 一个 `.tsx` 只定义一个组件或一个 hook，不嵌套定义组件/hook。
- 单个组件文件不超过 300 行；页面只组合领域组件。
- 通用按钮、图标按钮、卡片、列表行、分段控件、Sheet、Dialog、空态、输入框先抽底层组件。
- 业务组件按 chat、composer、history、settings、workspace 域组织。
- 测试夹具独立于页面；演示数据集中在 `src/fixtures`。

## 6. 状态设计

- `navigationStore`：抽屉、Sheet、根页签、搜索页。
- `conversationStore`：当前会话、消息流、生成状态、权限确认。
- `composerStore`：草稿、选择器、发送状态、模型、思考档、权限、上下文。
- `historyStore`：历史列表、搜索词、置顶、归档、重命名。
- `attachmentStore`：附件集合、添加中、失败与取消。
- `settingsStore`：主题、语言、默认模型、默认思考、默认权限、通知、触感。
- 状态动作保持同步、无网络、无业务异常；非法 id 或空标题退化为无操作或安全缺省。

## 7. 实施顺序

1. 工程基线：Expo workspace、配置、依赖、lint、typecheck、Jest、覆盖率。
2. 设计系统：token、字体、图标、主题、底层 UI 组件和 strings。
3. 状态与夹具：六个 Zustand store、领域类型、演示数据。
4. 主体验证切片：对话首页、Composer、模型/思考/权限选择、关键交互和测试。
5. 历史与工作空间：抽屉、搜索、会话操作、工作空间、连接电脑。
6. 完整页面：设置子页、用量、归档、帮助、关于、隐私、安全、资料、模型管理。
7. 质量收口：覆盖率、iOS/Android bundle、Expo Doctor、组件行数检查、对抗审查、模拟器/浏览器 UI 走查。

每个阶段保持可独立构建；收口时不存在占位页面、假按钮或未接线入口。

## 8. 测试口径

### 状态单元测试

- 六个 store 的合法动作、空输入、未知 id、超长文本、重复选择与取消路径。
- 抽屉和 Sheet 互斥；切换会话关闭选择器；归档/删除后列表一致。
- 附件添加中、完成、失败、移除、取消；垃圾元数据不崩溃。

### 组件与交互测试

- 对话空态、用户/助手消息、思考折叠、权限确认、Composer 发送与停止。
- 模型搜索和选择、思考档与权限模式选择。
- 历史搜索、分组、置顶、重命名、归档、删除。
- 设置页所有可见控件改变 Zustand 状态并有 accessibility role/label/state。
- iOS/Android 平台差异快照或行为断言。

### 构建与平台

- TypeScript、lint、unit/component tests、Expo Doctor、iOS bundle、Android bundle、Expo export 全部执行。
- 覆盖率阈值为行/语句/函数 90%、分支 85%；只补测试，不降低阈值。

## 9. 性能与生命周期预算

- 首屏仅挂载当前路由与可见领域组件，历史长列表使用轻量虚拟化或分页数据。
- 不创建轮询器；生成 shimmer 只使用共享动画驱动。
- 系统 picker 取消后不残留临时订阅；Sheet、键盘和选择器关闭时释放监听。
- 单个组件文件不超过 300 行；测试与演示数据不进入生产 bundle。

## 10. 验收清单

- [x] 对话、Composer、附件、模型、思考、权限完整可交互。
- [x] 历史抽屉、搜索、分组、会话操作完整。
- [x] 工作空间及所有补充页面可达；连接电脑由设备与连接状态区承接。
- [x] 设置页与默认偏好完整。
- [x] iOS/Android 安全区、键盘、返回和无障碍由 SafeArea、KeyboardAvoidingView、Router 与 accessibility 属性承接；iOS/Android Hermes bundle 通过。
- [x] 组件文件均不超过 300 行且单组件文件纪律成立。
- [x] 四门与双平台 bundle 通过；移动端覆盖率语句 92.61%、分支 87.06%、函数 90.47%、行 95%。
- [ ] 独立对抗审查问题清零。
- [x] 无 TODO、假成功按钮、密钥、真实网络或凭据。

## 11. 验证记录

- 根级 `bun run lint`：0 warning / 0 error。
- 根级 `bun run typecheck`：Electron 与 mobile 全部通过。
- 根级 `bun run build`：Electron 与 Expo Web export 全部通过。
- 根级 `bun run test`：既有 Bun 2063 pass / 1 skip / 0 fail；移动端 Jest 12 suites / 48 tests 全绿。
- Expo iOS / Android Hermes bundle：全部通过。
- `expo install --check`：依赖与 SDK 57 官方矩阵一致。
- bw Web 走查：首屏、抽屉、设置深色、模型、思考、权限、附件 Sheet、真实发送均通过；浏览器 errors/console 为空。
- Expo Doctor 在当前无 npm 的 Bun 环境中：配置 schema 与 peer dependency 检查通过；依赖树/重复链接相关检查因 Doctor 硬调用 npm 未能完整执行，且同版本包在 Bun `.bun` 布局出现重复链接。该工具链限制不掩盖为通过，原生 Metro bundle 另门通过。
