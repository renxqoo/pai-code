import type { ChatMessage, ConversationSession } from '@/types/domain';

const message = (values: ChatMessage): ChatMessage => values;

const auditSummary = [
  '## 现状审计',
  '',
  'Expo / React Native 应用已有完整页面骨架，短板在**信息层级**而不是页面数量。',
  '',
  '- 页面路由齐全，组件按 `ui / features / app` 分层',
  '- 思考、工具调用、状态逐条铺开，长任务刷屏',
  '- 输入区与顶栏控件密度偏高，正文被挤压',
  '',
  '> 结论：不继续堆页面，先把对话阅读体验和过程折叠做对。',
  '',
  '参考资料：[Codex 产品页](https://openai.com/codex/) 与 [Claude Code](https://www.anthropic.com/claude-code)。',
].join('\n');

const timelinePlan = [
  '## 任务时间线',
  '',
  '参考 Codex / Claude Code 的共同信息架构，只借层级与交互，*不复制品牌视觉*。',
  '',
  '1. **用户意图**与最终结论始终在正文层，开放排版',
  '2. 思考、读取、搜索、命令合并为一条**活动摘要**',
  '3. 成功默认折叠；失败默认展开，收起后仍保留失败原因',
  '4. 运行中只显示当前动作与整体进度',
  '',
  '```ts',
  'type TimelineBlock =',
  '  | { kind: "message"; message: ChatMessage }',
  '  | { kind: "activity"; messages: readonly ChatMessage[] };',
  '```',
  '',
  '---',
  '',
  '实现顺序：分组算法 → 活动摘要 → 任务卡 → 对话列表。',
].join('\n');

const verifySummary = [
  '## 验证结果',
  '',
  '时间线重构已收口，四门全绿，覆盖率只升不降。',
  '',
  '- 移动端：语句 95.7%、分支 89.6%、行 97.4%',
  '- 390×844 浅色/深色走查均无横向溢出，页面错误为零',
  '- 独立对抗审查问题清零',
  '',
  '> 运行清单默认收起，失败步骤的执行详情不再被折叠吞掉。',
].join('\n');

const markdownAnswer = [
  '需要，但只用在 Agent 的**自然语言正文**，不要把整个消息列表都交给 Markdown。用户输入保持*纯文本*任务卡。',
  '',
  '- 用户请求：保持低对比任务卡',
  '- thinking / tool / status：继续走结构化活动组件',
  '- 代码与 diff：专用组件，围栏只做轻量展示',
  '',
  '首批支持标题、段落、粗体、斜体、行内代码、列表、引用与安全链接；表格、图片与 HTML 降级纯文本。',
].join('\n');

const parserPivot = [
  '## 解析器选型',
  '',
  '1. `marked@17` 为 ESM-only，Jest 29 无法 `require`，三种转译方案均失败',
  '2. 改用 `markdown-it`：CJS、纯 JS、Hermes 可运行，token 流成熟',
  '3. 行内代码 token 是 `code_inline`，inline 子节点挂在 `children`',
  '',
  '> 词表封闭 + 垃圾降级，非法协议链接永不触发打开。',
].join('\n');

const deliverySummary = [
  '## 交付',
  '',
  '**Markdown 组件**已接入正文渲染，**完整 Mock 会话**按真实事件流组织。',
  '',
  '- 解析：六类块、五类行内节点，嵌套内容不丢失',
  '- 渲染：纯 RN 原语，无 WebView、无 HTML 注入',
  '- 安全：仅 `http/https` 可点，控制字符与空主机拒绝',
  '- 会话：多轮任务、失败重试、子代理报告、运行态齐全',
  '',
  '---',
  '',
  '四门全绿，双平台 bundle 通过，bw 走查无溢出。',
].join('\n');

const bwReview = [
  '## bw 使用体感',
  '',
  '**顺手**：`eval` 做断言最可靠，`snap` + 索引操作对按钮稳定，`errors/console/look` 收尾快。',
  '',
  '**短板**：`clicktext` 对嵌套文本命中不稳，多次误触；索引每次动作后重排；',
  '宿主侧日志 `console` 抓不到，需要盯后台任务输出。',
  '',
  '> 结论：验收工具称职，交互录制一般。点击优先用索引。',
].join('\n');

export const agentConversation: ConversationSession = {
  id: 'session-agent-journey',
  title: '重构手机端 React Native UI/UX',
  preview: '正在按真实事件流扩充完整会话…',
  project: 'agent-app',
  timeLabel: '刚刚',
  state: 'working',
  pinned: true,
  archived: false,
  unread: false,
  messages: [
    // 第一轮：现状审计与基线走查
    message({ id: 'user-1', kind: 'user', text: 'bw可以预览测试ui，开发优化重构手机端react native ui、ux,一个简洁，优美的app应用，', createdAt: '09:02' }),
    message({ id: 'think-1', kind: 'thinking', text: '先做只读审计摸清页面、设计系统与运行方式，再给可验证的改造方案。', createdAt: '09:02' }),
    message({ id: 'tool-task-1', kind: 'tool', title: '创建实施任务', text: '建立审计、方案、实施与验证的阶段任务。', status: 'success', durationMs: 120, summary: '建立 3 项阶段任务', createdAt: '09:03' }),
    message({ id: 'tool-read-skill', kind: 'tool', title: '读取工作流规范', text: '确认方案先行、四门验证与真实界面走查的执行口径。', status: 'success', durationMs: 180, summary: '读取 2 份规范', createdAt: '09:03' }),
    message({ id: 'tool-audit', kind: 'tool', title: '审计移动端结构', text: '梳理路由、组件分层、主题与状态域，确认可改造范围。', status: 'success', durationMs: 2400, summary: '盘点 15 个路由与 6 个状态域', createdAt: '09:04' }),
    message({ id: 'tool-git-status', kind: 'tool', title: '检查工作区状态', text: '确认分支干净、无他人在途改动。', status: 'success', durationMs: 90, summary: '工作区干净', createdAt: '09:04' }),
    message({ id: 'tool-read-components', kind: 'tool', title: '读取核心组件', text: '逐个读取对话页、输入区、抽屉与主题 token。', status: 'success', durationMs: 1100, summary: '读取 13 个文件', createdAt: '09:05' }),
    message({ id: 'assistant-audit', kind: 'assistant', text: auditSummary, createdAt: '09:06' }),
    message({ id: 'tool-web-preview-fail', kind: 'tool', title: '启动 Web 预览', text: '工具进程 PATH 缺少 bun，启动失败。', status: 'error', durationMs: 40, summary: 'exit 127：bun not found', createdAt: '09:07' }),
    message({ id: 'tool-web-preview-retry', kind: 'tool', title: '改用绝对路径重试', text: '以本机 Bun 显式路径启动 Expo Web。', status: 'success', durationMs: 3200, summary: '预览服务就绪', createdAt: '09:08' }),
    message({ id: 'tool-bw-walk', kind: 'tool', title: '走查关键页面', text: '在 390×844 视口逐屏检查首页、对话、抽屉与设置。', status: 'success', durationMs: 4100, summary: '4 条旅程通过，错误为零', createdAt: '09:09' }),
    message({ id: 'status-walk', kind: 'status', text: '基线走查完成', status: 'success', durationMs: 9800, summary: '390×844 无横向溢出', createdAt: '09:09' }),
    message({ id: 'assistant-baseline', kind: 'assistant', text: '基线走查通过。视觉问题集中在层级平均与过程刷屏，接下来给重构方案。', createdAt: '09:10' }),

    // 第二轮：继续推进
    message({ id: 'user-2', kind: 'user', text: '继续任务', createdAt: '09:12' }),
    message({ id: 'think-2', kind: 'thinking', text: '基线已覆盖，把改造收敛成可实施、可回滚的批次。', createdAt: '09:12' }),
    message({ id: 'tool-plan-batches', kind: 'tool', title: '整理改造批次', text: '把页面、输入区与过程展示收敛为四个批次。', status: 'success', durationMs: 860, summary: '方案落档 4 个批次', createdAt: '09:13' }),
    message({ id: 'assistant-batches', kind: 'assistant', text: '方案已落档：设计系统 → 对话时间线 → 输入区 → 对话列表，逐批验证。', createdAt: '09:13' }),

    // 第三轮：Codex / Claude Code 风格重构
    message({ id: 'user-3', kind: 'user', text: '我建议重构ui，参考codex、claude code ui风格，包括对话列表，对话列表消息组件，消息如何优雅展示，一堆消息展示，和一堆工具调用，我觉得没有必要，合理折叠是最优的，codex是如何设计的，ui、ux', createdAt: '09:20' }),
    message({ id: 'think-3', kind: 'thinking', text: '共同点是任务时间线：正文优先，过程按阶段聚合，运行态单行可见。', createdAt: '09:20' }),
    message({ id: 'tool-reference', kind: 'tool', title: '研究公开界面', text: '提取 Codex 与 Claude Code 在过程折叠和任务状态上的信息架构。', status: 'success', durationMs: 1500, summary: '提炼 2 套共同模式', createdAt: '09:21' }),
    message({ id: 'tool-spawn-explore', kind: 'tool', title: '委托界面审计', text: '派出只读子代理核实组件职责与可复用边界。', status: 'success', durationMs: 4200, summary: '子代理已返回报告', createdAt: '09:22' }),
    message({ id: 'sys-report-1', kind: 'system', text: '子代理报告：活动聚合、失败暴露与运行摘要是当前最大的体验缺口，建议按阶段折叠重排时间线。', createdAt: '09:22' }),
    message({ id: 'assistant-plan', kind: 'assistant', text: timelinePlan, createdAt: '09:23' }),
    message({ id: 'tool-write-tests', kind: 'tool', title: '补齐分组测试', text: '锁定混合活动聚合、正文边界与失败重试的展示口径。', status: 'success', durationMs: 640, summary: '新增 8 个用例', createdAt: '09:24' }),
    message({ id: 'tool-edit-timeline', kind: 'tool', title: '改造时间线组件', text: '实现活动摘要、任务卡与对话列表的统一层级。', status: 'success', durationMs: 2100, summary: '修改 9 个文件', createdAt: '09:25' }),
    message({ id: 'tool-test-fail', kind: 'tool', title: '首次运行测试', text: '旧断言仍按逐条消息展示，首轮时间线用例失败。', status: 'error', durationMs: 1300, summary: '3 个用例失败', createdAt: '09:26' }),
    message({ id: 'think-4', kind: 'thinking', text: '失败集中在旧展示口径，按新契约更新断言后重跑。', createdAt: '09:26' }),
    message({ id: 'tool-test-retry', kind: 'tool', title: '重跑测试', text: '更新断言后执行全量用例与覆盖率检查。', status: 'success', durationMs: 2600, summary: '22 suites / 123 tests', createdAt: '09:27' }),
    message({ id: 'tool-coverage-dip', kind: 'tool', title: '核对覆盖率', text: '格式化展开两处紧凑组件，分支覆盖率短暂回落。', status: 'error', durationMs: 2100, summary: '分支 88.7%，低于基线', createdAt: '09:28' }),
    message({ id: 'tool-coverage-fix', kind: 'tool', title: '补边界用例回血', text: '补状态组合与降级用例，覆盖率恢复并超过基线。', status: 'success', durationMs: 1800, summary: '分支 89.7%', createdAt: '09:29' }),
    message({ id: 'code-timeline', kind: 'code', title: 'timeline-blocks.ts', language: 'ts', text: 'export function groupTimeline(messages: readonly ChatMessage[]) {\n  return messages.reduce((blocks, message) => {\n    const last = blocks.at(-1);\n    if (last !== undefined && isProcess(message)) {\n      last.messages.push(message);\n      return blocks;\n    }\n    blocks.push(toBlock(message));\n    return blocks;\n  }, []);\n}', lineCount: 11, summary: '+11 -0', createdAt: '09:30' }),
    message({ id: 'tool-four-gates', kind: 'tool', title: '运行四门', text: 'lint、typecheck、build、test 全链验证。', status: 'success', durationMs: 22000, summary: '0 warning / 0 error', createdAt: '09:31' }),
    message({ id: 'tool-bundle-ios', kind: 'tool', title: '构建 iOS', text: '执行 iOS Hermes bundle 验证。', status: 'success', durationMs: 5700, summary: 'iOS bundle 4.8 MB', createdAt: '09:32' }),
    message({ id: 'tool-bundle-android', kind: 'tool', title: '构建 Android', text: '执行 Android Hermes bundle 验证。', status: 'success', durationMs: 5900, summary: 'Android bundle 5.1 MB', createdAt: '09:33' }),
    message({ id: 'tool-bw-scroll-warn', kind: 'tool', title: '真实走查复检', text: '宿主日志发现滚动监听缺节流参数，影响离底判定。', status: 'error', durationMs: 2400, summary: 'scrollEventThrottle 缺失', createdAt: '09:34' }),
    message({ id: 'tool-scroll-fix', kind: 'tool', title: '修复滚动监听', text: '补节流参数并加回归断言，重走查通过。', status: 'success', durationMs: 1600, summary: '走查无告警', createdAt: '09:35' }),
    message({ id: 'status-verify', kind: 'status', text: '时间线重构完成', status: 'success', durationMs: 68000, summary: '四门全绿，双平台通过', createdAt: '09:36' }),
    message({ id: 'assistant-verify', kind: 'assistant', text: verifySummary, createdAt: '09:36' }),
    message({ id: 'tool-spawn-review', kind: 'tool', title: '发起对抗审查', text: '独立会话按“假设代码有错”审查 diff 与契约。', status: 'success', durationMs: 54000, summary: '审查报告已返回', createdAt: '09:38' }),
    message({ id: 'sys-report-2', kind: 'system', text: '对抗审查：无阻断；建议补运行计数、任务卡样式与失败原因唯一展示。', createdAt: '09:38' }),
    message({ id: 'tool-review-fix-1', kind: 'tool', title: '修复审查问题', text: '补运行进度计数、任务卡样式与失败摘要优先级。', status: 'success', durationMs: 1400, summary: '修复 3 项', createdAt: '09:39' }),
    message({ id: 'sys-report-3', kind: 'system', text: '复核通过：交错 thinking/tool 运行态与统一进度口径确认修复，无重要遗留。', createdAt: '09:40' }),
    message({ id: 'assistant-delivery-1', kind: 'assistant', text: '任务时间线已交付：过程按阶段折叠、失败主动暴露、运行态单行可见。', createdAt: '09:40' }),

    // 第四轮：Markdown 组件决策
    message({ id: 'user-4', kind: 'user', text: '需要用markdown组件吗', createdAt: '10:02' }),
    message({ id: 'assistant-markdown-decision', kind: 'assistant', text: markdownAnswer, createdAt: '10:03' }),

    // 第五轮：实现 Markdown 与完整 Mock
    message({ id: 'user-5', kind: 'user', text: '实现markdown组件， mock完整的对话数据，可以直接参考 events.jsonl 数据造数据，我看完整的对话消息列表是怎么样展示的', createdAt: '10:10' }),
    message({ id: 'think-5', kind: 'thinking', text: '按事件形态合成完整会话：正文用 Markdown，过程保持活动折叠，末尾留运行态。', createdAt: '10:10' }),
    message({ id: 'tool-event-schema', kind: 'tool', title: '梳理事件形态', text: '统计 user/assistant/thinking/tool/status/code 的分布与工具调用序列。', status: 'success', durationMs: 720, summary: '覆盖 6 类事件', createdAt: '10:11' }),
    message({ id: 'tool-write-parser', kind: 'tool', title: '实现解析层', text: '落地封闭词表解析与垃圾输入降级，先写测试再写实现。', status: 'success', durationMs: 1900, summary: '解析测试 8 个用例', createdAt: '10:12' }),
    message({ id: 'tool-jest-esm-fail', kind: 'tool', title: '运行解析测试', text: '首选解析器为 ESM-only，Jest 无法 require。', status: 'error', durationMs: 1100, summary: 'ERR_REQUIRE_ESM', createdAt: '10:13' }),
    message({ id: 'think-6', kind: 'thinking', text: '依次试 babel 转译、UMD 映射、独立 transform，再决定是否换解析器。', createdAt: '10:13' }),
    message({ id: 'tool-babel-retry', kind: 'tool', title: '配置 Babel 转译重试', text: '对 ESM-only 包强制转 CJS 后重跑测试。', status: 'error', durationMs: 900, summary: 'root 配置不覆盖外部包', createdAt: '10:14' }),
    message({ id: 'tool-umd-retry', kind: 'tool', title: '映射 UMD 构建重试', text: '把测试入口映射到 UMD 构建后重跑。', status: 'error', durationMs: 800, summary: '仍按包级 type:module 判定', createdAt: '10:15' }),
    message({ id: 'tool-switch-parser', kind: 'tool', title: '切换 CJS 解析器', text: '改用 markdown-it 并按 token 流重写解析层。', status: 'success', durationMs: 2200, summary: '解析测试全绿', createdAt: '10:16' }),
    message({ id: 'assistant-parser-pivot', kind: 'assistant', text: parserPivot, createdAt: '10:16' }),
    message({ id: 'tool-token-bug', kind: 'tool', title: '修复词法差异', text: 'inline 子节点在 children、行内代码 token 名不同，导致内容为空。', status: 'error', durationMs: 1400, summary: '2 类 token 形态踩坑', createdAt: '10:17' }),
    message({ id: 'tool-parser-green', kind: 'tool', title: '重跑解析测试', text: '修正词法映射并补列表/引用边界用例。', status: 'success', durationMs: 1300, summary: '37 个用例通过', createdAt: '10:18' }),
    message({ id: 'tool-write-render', kind: 'tool', title: '实现渲染组件', text: '落地段落、标题、列表、引用、分隔线、代码与安全链接。', status: 'success', durationMs: 2800, summary: '新增 6 个渲染组件', createdAt: '10:19' }),
    message({ id: 'tool-codeblock-refactor', kind: 'tool', title: '统一代码块实现', text: '围栏代码与时间线工件共用同一个折叠组件。', status: 'success', durationMs: 1200, summary: '消除双轨实现', createdAt: '10:20' }),
    message({ id: 'tool-migration-fail', kind: 'tool', title: '迁移测试调用面', text: '代码块接口变更后旧测试仍传消息对象。', status: 'error', durationMs: 1000, summary: '1 个用例失败', createdAt: '10:21' }),
    message({ id: 'tool-migration-fix', kind: 'tool', title: '更新调用面重跑', text: '改为纯 props 后全量测试回归。', status: 'success', durationMs: 1900, summary: '22 suites 全绿', createdAt: '10:22' }),
    message({ id: 'assistant-progress-2', kind: 'assistant', text: '解析与渲染都已落地，正在按真实事件流扩充完整 Mock 会话。', createdAt: '10:22' }),
    message({ id: 'tool-write-fixture', kind: 'tool', title: '构造完整 Mock 会话', text: '按事件流组织多轮任务、失败重试、子代理报告与运行态。', status: 'success', durationMs: 1600, summary: '会话 60+ 条消息', createdAt: '10:23' }),
    message({ id: 'tool-wire-entry', kind: 'tool', title: '接线空态入口', text: '空态「查看示例对话」直达完整会话，历史抽屉置顶。', status: 'success', durationMs: 700, summary: '入口可达', createdAt: '10:24' }),
    message({ id: 'tool-gates-2', kind: 'tool', title: '运行四门与覆盖率', text: '全链验证并核对覆盖率不低于基线。', status: 'success', durationMs: 24000, summary: '覆盖率四项均升', createdAt: '10:25' }),
    message({ id: 'sys-report-4', kind: 'system', text: '对抗审查：1 个门禁红 + 列表/引用内内容丢失边界，需在核销前修复。', createdAt: '10:26' }),
    message({ id: 'tool-review-fix-2', kind: 'tool', title: '修复审查问题', text: '修复门禁红、内容丢失、嵌套链接与安全边界，补深度上限防护。', status: 'success', durationMs: 3200, summary: '处置 10 项', createdAt: '10:27' }),
    message({ id: 'tool-final-bw', kind: 'tool', title: '最终真实走查', text: '复检完整会话的 Markdown、折叠、失败与运行态展示。', status: 'success', durationMs: 4800, summary: '无溢出，错误为零', createdAt: '10:28' }),
    message({ id: 'status-final', kind: 'status', text: 'Markdown 与完整 Mock 交付', status: 'success', durationMs: 96000, summary: '审查问题清零', createdAt: '10:29' }),
    message({ id: 'assistant-delivery-2', kind: 'assistant', text: deliverySummary, createdAt: '10:29' }),

    // 第六轮：工具问答
    message({ id: 'user-6', kind: 'user', text: '称子agent 还在执行任务，我问你，bw工具好用吗，', createdAt: '10:40' }),
    message({ id: 'assistant-bw-review', kind: 'assistant', text: bwReview, createdAt: '10:41' }),

    // 第七轮：按真实事件流扩充 Mock
    message({ id: 'user-7', kind: 'user', text: '根据 events.jsonl 加mock数据你加了吗', createdAt: '10:50' }),
    message({ id: 'assistant-honest', kind: 'assistant', text: '加了，但此前只按事件形态自造内容，主线没有对齐真实会话。现在按真实轮次与工具序列重做。', createdAt: '10:51' }),
    message({ id: 'user-8', kind: 'user', text: '现在一个对话数据太少了，参考 events.jsonl 这个真实 agent 执行的任务数据', createdAt: '10:55' }),
    message({ id: 'think-7', kind: 'thinking', text: '把七轮主线、失败链、子代理报告与状态变化全部纳入，形成可直读的完整消息列表。', createdAt: '10:55' }),
    message({ id: 'tool-mine-events', kind: 'tool', title: '挖掘真实事件流', text: '提取各轮工具序列、失败重试链与子代理通知。', status: 'running', durationMs: 3200, summary: '正在汇总 7 轮执行数据', createdAt: '10:56' }),
  ],
};
