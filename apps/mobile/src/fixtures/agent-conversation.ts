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
  // 演示态会话计时：2 分钟前开工，运行中实时推进（裁决：已工作/共工作 + 时间）
  startedAtMs: Date.now() - 2 * 60 * 1000,
  pinned: true,
  archived: false,
  unread: false,
  messages: [
    // 第一轮：现状审计与基线走查（并行批次：命令 + 阅读 + 搜索 → 组头合成）
    message({ id: 'user-1', kind: 'user', text: 'bw可以预览测试ui，开发优化重构手机端react native ui、ux,一个简洁，优美的app应用，', createdAt: '09:02' }),
    message({ id: 'think-1', kind: 'thinking', text: '先做只读审计摸清页面、设计系统与运行方式，再给可验证的改造方案。', createdAt: '09:02', status: 'ok' }),
    message({ id: 'tool-audit-tree', kind: 'tool', toolName: 'bash', createdAt: '09:03', status: 'ok', durationMs: 240, exitCode: 0, argsPreview: 'find apps/mobile/src -type f | sort', text: 'apps/mobile/app/_layout.tsx\napps/mobile/app/index.tsx\n…（15 个路由，6 个状态域）' }),
    message({ id: 'tool-read-components', kind: 'tool', toolName: 'read', createdAt: '09:03', status: 'ok', durationMs: 120, exitCode: 0, argsPreview: 'apps/mobile/src/features/chat/chat-screen.tsx', text: '1 export function ChatScreen() {\n2   const scrollRef = React.useRef<ScrollView>(null);\n…' }),
    message({ id: 'tool-search-flows', kind: 'tool', toolName: 'grep', createdAt: '09:03', status: 'ok', durationMs: 90, exitCode: 0, argsPreview: 'grep -rn "onPress" apps/mobile/src', text: 'src/features/chat/tool-row.tsx:31:onPress\n…（24 处命中，零 hover 依赖）' }),
    message({ id: 'tool-git-status', kind: 'tool', toolName: 'bash', createdAt: '09:04', status: 'ok', durationMs: 80, exitCode: 0, argsPreview: 'git status --short', text: '' }),
    message({ id: 'assistant-audit', kind: 'assistant', text: auditSummary, createdAt: '09:06' }),

    // 失败 → 重试链（失败行整句「运行失败」+ 退出码尾）
    message({ id: 'tool-web-preview-fail', kind: 'tool', toolName: 'bash', createdAt: '09:07', status: 'failed', durationMs: 40, exitCode: 127, argsPreview: 'bun run web', text: 'zsh: command not found: bun' }),
    message({ id: 'tool-web-preview-retry', kind: 'tool', toolName: 'bash', createdAt: '09:08', status: 'ok', durationMs: 3200, exitCode: 0, argsPreview: '/Users/wrr/.bun/bin/bun run web', text: '预览服务就绪 http://localhost:8081' }),
    message({ id: 'tool-bw-walk', kind: 'tool', toolName: 'bash', createdAt: '09:09', status: 'ok', durationMs: 4100, exitCode: 0, argsPreview: 'bw s snap --viewport 390x844', text: '4 条旅程通过，错误为零' }),
    message({ id: 'status-walk', kind: 'status', text: '基线走查完成', status: 'ok', durationMs: 9800, summary: '390×844 无横向溢出', createdAt: '09:09' }),
    message({ id: 'assistant-baseline', kind: 'assistant', text: '基线走查通过。视觉问题集中在层级平均与过程刷屏，接下来给重构方案。', createdAt: '09:10' }),

    // 第二轮：继续推进（同一文件两次编辑 → 一个 diff 归并）
    message({ id: 'user-2', kind: 'user', text: '继续任务', createdAt: '09:12' }),
    message({ id: 'think-2', kind: 'thinking', text: '基线已覆盖，把改造收敛成可实施、可回滚的批次。', createdAt: '09:12', status: 'ok' }),
    message({ id: 'tool-plan-batches-1', kind: 'tool', toolName: 'edit', createdAt: '09:13', status: 'ok', durationMs: 420, exitCode: 0, text: '', argsPreview: 'tasks/T47-Mobile-Agent-Timeline-UI.md', editHunks: [{ path: 'tasks/T47-Mobile-Agent-Timeline-UI.md', oldText: '## 待定', newText: '## 实施批次\n\n设计系统 → 对话时间线 → 输入区 → 对话列表。' }] }),
    message({ id: 'tool-plan-batches-2', kind: 'tool', toolName: 'edit', createdAt: '09:13', status: 'ok', durationMs: 260, exitCode: 0, text: '', argsPreview: 'tasks/T47-Mobile-Agent-Timeline-UI.md', editHunks: [{ path: 'tasks/T47-Mobile-Agent-Timeline-UI.md', oldText: '验证：待定', newText: '验证：每批四门全绿 + 真机走查，覆盖率只升不降。' }] }),
    message({ id: 'assistant-batches', kind: 'assistant', text: '方案已落档：设计系统 → 对话时间线 → 输入区 → 对话列表，逐批验证。', createdAt: '09:13' }),

    // 第三轮：Codex / Claude Code 风格重构（task 工具子代理清单 + 未知工具）
    message({ id: 'user-3', kind: 'user', text: '我建议重构ui，参考codex、claude code ui风格，包括对话列表，对话列表消息组件，消息如何优雅展示，一堆消息展示，和一堆工具调用，我觉得没有必要，合理折叠是最优的，codex是如何设计的，ui、ux', createdAt: '09:20' }),
    message({ id: 'think-3', kind: 'thinking', text: '共同点是任务时间线：正文优先，过程按阶段聚合，运行态单行可见。', createdAt: '09:20', status: 'ok' }),
    message({ id: 'tool-spawn-explore', kind: 'tool', toolName: 'task', createdAt: '09:21', status: 'ok', durationMs: 4200, exitCode: 0, argsPreview: '', subagents: [
      { agent: 'explore-ui', task: '核实组件职责与可复用边界' },
      { agent: 'explore-patterns', task: '提炼 Codex / Claude Code 过程折叠模式' },
    ], text: '两个子代理已返回报告' }),
    message({ id: 'tool-web-reference', kind: 'tool', toolName: 'webfetch', createdAt: '09:22', status: 'ok', durationMs: 1500, exitCode: 0, argsPreview: 'https://openai.com/codex/', text: '标题：Codex；产品页只借层级与交互，不复制品牌视觉。' }),
    message({ id: 'sys-report-1', kind: 'system', text: '子代理报告：活动聚合、失败暴露与运行摘要是当前最大的体验缺口，建议按阶段折叠重排时间线。', createdAt: '09:22' }),
    message({ id: 'assistant-plan', kind: 'assistant', text: timelinePlan, createdAt: '09:23' }),

    // 实施与验证链（编辑 + 命令并行批次；两次失败重试）
    message({ id: 'tool-edit-timeline-1', kind: 'tool', toolName: 'edit', createdAt: '09:25', status: 'ok', durationMs: 900, exitCode: 0, text: '', argsPreview: 'src/features/chat/timeline-list.tsx', editHunks: [{ path: 'src/features/chat/timeline-list.tsx', oldText: 'messages.map(toBlock)', newText: 'groupTimeline(messages)' }] }),
    message({ id: 'tool-edit-timeline-2', kind: 'tool', toolName: 'edit', createdAt: '09:25', status: 'ok', durationMs: 640, exitCode: 0, text: '', argsPreview: 'src/features/chat/timeline-list.tsx', editHunks: [{ path: 'src/features/chat/timeline-list.tsx', oldText: 'export function TimelineList(', newText: 'export function TimelineList({ messages, generating }: TimelineListProps) {' }] }),
    message({ id: 'tool-write-tests', kind: 'tool', toolName: 'edit', createdAt: '09:25', status: 'ok', durationMs: 640, exitCode: 0, text: '', argsPreview: 'src/features/chat/__tests__/turns.jest.ts', editHunks: [{ path: 'src/features/chat/__tests__/turns.jest.ts', oldText: "describe('旧展示口径'", newText: "describe('时间线分组'" }] }),
    message({ id: 'tool-test-fail', kind: 'tool', toolName: 'bash', createdAt: '09:26', status: 'failed', durationMs: 1300, exitCode: 1, argsPreview: 'bun test', text: '3 个用例失败：旧断言仍按逐条消息展示' }),
    message({ id: 'think-4', kind: 'thinking', text: '失败集中在旧展示口径，按新契约更新断言后重跑。', createdAt: '09:26', status: 'ok' }),
    message({ id: 'tool-test-retry', kind: 'tool', toolName: 'bash', createdAt: '09:27', status: 'ok', durationMs: 2600, exitCode: 0, argsPreview: 'bun test', text: '22 suites / 123 tests' }),
    message({ id: 'tool-coverage-dip', kind: 'tool', toolName: 'bash', createdAt: '09:28', status: 'failed', durationMs: 2100, exitCode: 1, argsPreview: 'bun run test:coverage', text: '分支 88.7%，低于基线' }),
    message({ id: 'tool-coverage-fix', kind: 'tool', toolName: 'bash', createdAt: '09:29', status: 'ok', durationMs: 1800, exitCode: 0, argsPreview: 'bun run test:coverage', text: '分支 89.7%' }),
    message({ id: 'code-timeline', kind: 'code', title: 'timeline-blocks.ts', language: 'ts', text: 'export function groupTimeline(messages: readonly ChatMessage[]) {\n  return messages.reduce((blocks, message) => {\n    const last = blocks.at(-1);\n    if (last !== undefined && isProcess(message)) {\n      last.messages.push(message);\n      return blocks;\n    }\n    blocks.push(toBlock(message));\n    return blocks;\n  }, []);\n}', lineCount: 11, summary: '+11 -0', createdAt: '09:30' }),
    message({ id: 'tool-four-gates', kind: 'tool', toolName: 'bash', createdAt: '09:31', status: 'ok', durationMs: 22000, exitCode: 0, argsPreview: 'bun run ci', text: '0 warning / 0 error' }),
    message({ id: 'tool-bundle-ios', kind: 'tool', toolName: 'bash', createdAt: '09:32', status: 'ok', durationMs: 5700, exitCode: 0, argsPreview: 'bun run build:ios', text: 'iOS bundle 4.8 MB' }),
    message({ id: 'tool-bundle-android', kind: 'tool', toolName: 'bash', createdAt: '09:33', status: 'ok', durationMs: 5900, exitCode: 0, argsPreview: 'bun run build:android', text: 'Android bundle 5.1 MB' }),
    message({ id: 'tool-bw-scroll-warn', kind: 'tool', toolName: 'bash', createdAt: '09:34', status: 'ok', durationMs: 2400, exitCode: 0, argsPreview: 'bw s console --tail', text: 'WARN scrollEventThrottle 缺失，影响离底判定' }),
    message({ id: 'tool-scroll-fix', kind: 'tool', toolName: 'edit', createdAt: '09:35', status: 'ok', durationMs: 1600, exitCode: 0, text: '', argsPreview: 'src/features/chat/chat-screen.tsx', editHunks: [{ path: 'src/features/chat/chat-screen.tsx', oldText: 'onScroll={onScroll}', newText: 'onScroll={onScroll} scrollEventThrottle={16}' }] }),
    message({ id: 'status-verify', kind: 'status', text: '时间线重构完成', status: 'ok', durationMs: 68000, summary: '四门全绿，双平台通过', createdAt: '09:36' }),
    message({ id: 'assistant-verify', kind: 'assistant', text: verifySummary, createdAt: '09:36' }),

    // 对抗审查（task + 修复批次：编辑 + 命令并行）
    message({ id: 'tool-spawn-review', kind: 'tool', toolName: 'task', createdAt: '09:38', status: 'ok', durationMs: 54000, exitCode: 0, argsPreview: '', subagents: [{ agent: 'adversary', task: '按「假设代码有错」审查 diff 与契约' }], text: '审查报告已返回' }),
    message({ id: 'sys-report-2', kind: 'system', text: '对抗审查：无阻断；建议补运行计数、任务卡样式与失败原因唯一展示。', createdAt: '09:38' }),
    message({ id: 'tool-review-fix-edit', kind: 'tool', toolName: 'edit', createdAt: '09:39', status: 'ok', durationMs: 720, exitCode: 0, text: '', argsPreview: 'src/features/chat/process-fold.tsx', editHunks: [{ path: 'src/features/chat/process-fold.tsx', oldText: 'const label = elapsed;', newText: 'const label = elapsed !== null ? copy.workedFor(elapsed) : copy.processLabel;' }] }),
    message({ id: 'tool-review-fix-test', kind: 'tool', toolName: 'bash', createdAt: '09:39', status: 'ok', durationMs: 680, exitCode: 0, argsPreview: 'bun test process-fold', text: '3 个用例通过' }),
    message({ id: 'sys-report-3', kind: 'system', text: '复核通过：交错 thinking/tool 运行态与统一进度口径确认修复，无重要遗留。', createdAt: '09:40' }),
    message({ id: 'assistant-delivery-1', kind: 'assistant', text: '任务时间线已交付：过程按阶段折叠、失败主动暴露、运行态单行可见。', createdAt: '09:40' }),

    // 第四轮：Markdown 组件决策
    message({ id: 'user-4', kind: 'user', text: '需要用markdown组件吗', createdAt: '10:02' }),
    message({ id: 'assistant-markdown-decision', kind: 'assistant', text: markdownAnswer, createdAt: '10:03' }),

    // 第五轮：实现 Markdown 与完整 Mock（write 工具 + ESM 失败链）
    message({ id: 'user-5', kind: 'user', text: '实现markdown组件， mock完整的对话数据，可以直接参考 events.jsonl 数据造数据，我看完整的对话消息列表是怎么样展示的', createdAt: '10:10' }),
    message({ id: 'think-5', kind: 'thinking', text: '按事件形态合成完整会话：正文用 Markdown，过程保持活动折叠，末尾留运行态。', createdAt: '10:10', status: 'ok' }),
    message({ id: 'tool-event-schema', kind: 'tool', toolName: 'bash', createdAt: '10:11', status: 'ok', durationMs: 720, exitCode: 0, argsPreview: "jq -r '.type' events.jsonl | sort | uniq -c", text: '  12 assistant\n   8 user\n  31 tool\n   9 thinking\n   4 status' }),
    message({ id: 'tool-write-parser', kind: 'tool', toolName: 'write', createdAt: '10:12', status: 'ok', durationMs: 1900, exitCode: 0, argsPreview: 'src/features/chat/markdown/parse-markdown.ts', text: '词表封闭 + 垃圾降级的解析层已写入' }),
    message({ id: 'tool-jest-esm-fail', kind: 'tool', toolName: 'bash', createdAt: '10:13', status: 'failed', durationMs: 1100, exitCode: 1, argsPreview: 'bun test parse-markdown', text: 'ERR_REQUIRE_ESM: marked@17 is ESM-only' }),
    message({ id: 'think-6', kind: 'thinking', text: '依次试 babel 转译、UMD 映射、独立 transform，再决定是否换解析器。', createdAt: '10:13', status: 'ok' }),
    message({ id: 'tool-babel-retry', kind: 'tool', toolName: 'bash', createdAt: '10:14', status: 'failed', durationMs: 900, exitCode: 1, argsPreview: 'bun test --transform babel', text: 'root 配置不覆盖外部包' }),
    message({ id: 'tool-umd-retry', kind: 'tool', toolName: 'bash', createdAt: '10:15', status: 'failed', durationMs: 800, exitCode: 1, argsPreview: 'bun test --map umd', text: '仍按包级 type:module 判定' }),
    message({ id: 'tool-switch-parser', kind: 'tool', toolName: 'edit', createdAt: '10:16', status: 'ok', durationMs: 2200, exitCode: 0, text: '', argsPreview: 'src/features/chat/markdown/parse-markdown.ts', editHunks: [{ path: 'src/features/chat/markdown/parse-markdown.ts', oldText: "import { marked } from 'marked';", newText: "import MarkdownIt from 'markdown-it';" }] }),
    message({ id: 'assistant-parser-pivot', kind: 'assistant', text: parserPivot, createdAt: '10:16' }),
    message({ id: 'tool-token-bug', kind: 'tool', toolName: 'bash', createdAt: '10:17', status: 'failed', durationMs: 1400, exitCode: 1, argsPreview: 'bun test markdown', text: '2 类 token 形态踩坑：inline 子节点在 children、行内代码 token 名不同' }),
    message({ id: 'tool-parser-green', kind: 'tool', toolName: 'bash', createdAt: '10:18', status: 'ok', durationMs: 1300, exitCode: 0, argsPreview: 'bun test markdown', text: '37 个用例通过' }),
    message({ id: 'tool-write-render', kind: 'tool', toolName: 'write', createdAt: '10:19', status: 'ok', durationMs: 2800, exitCode: 0, argsPreview: 'src/features/chat/markdown/markdown-text.tsx', text: '段落、标题、列表、引用、分隔线、代码与安全链接渲染已写入' }),
    message({ id: 'tool-codeblock-refactor', kind: 'tool', toolName: 'edit', createdAt: '10:20', status: 'ok', durationMs: 1200, exitCode: 0, text: '', argsPreview: 'src/features/chat/code-block.tsx', editHunks: [{ path: 'src/features/chat/code-block.tsx', oldText: 'export function FenceBlock(', newText: 'export function CodeBlock(' }] }),
    message({ id: 'tool-migration-fail', kind: 'tool', toolName: 'bash', createdAt: '10:21', status: 'failed', durationMs: 1000, exitCode: 1, argsPreview: 'bun test', text: '1 个用例失败：旧测试仍传消息对象' }),
    message({ id: 'tool-migration-fix', kind: 'tool', toolName: 'bash', createdAt: '10:22', status: 'ok', durationMs: 1900, exitCode: 0, argsPreview: 'bun test', text: '22 suites 全绿' }),
    message({ id: 'assistant-progress-2', kind: 'assistant', text: '解析与渲染都已落地，正在按真实事件流扩充完整 Mock 会话。', createdAt: '10:22' }),
    message({ id: 'tool-write-fixture', kind: 'tool', toolName: 'write', createdAt: '10:23', status: 'ok', durationMs: 1600, exitCode: 0, argsPreview: 'src/fixtures/agent-conversation.ts', text: '会话 60+ 条消息已写入' }),
    message({ id: 'tool-gates-2', kind: 'tool', toolName: 'bash', createdAt: '10:25', status: 'ok', durationMs: 24000, exitCode: 0, argsPreview: 'bun run ci', text: '覆盖率四项均升' }),
    message({ id: 'sys-report-4', kind: 'system', text: '对抗审查：1 个门禁红 + 列表/引用内内容丢失边界，需在核销前修复。', createdAt: '10:26' }),
    message({ id: 'tool-review-fix-2-edit', kind: 'tool', toolName: 'edit', createdAt: '10:27', status: 'ok', durationMs: 2200, exitCode: 0, text: '', argsPreview: 'src/features/chat/markdown/parse-markdown.ts', editHunks: [{ path: 'src/features/chat/markdown/parse-markdown.ts', oldText: 'const DEPTH_MAX = Infinity;', newText: 'const DEPTH_MAX = 12;' }] }),
    message({ id: 'tool-review-fix-2-test', kind: 'tool', toolName: 'bash', createdAt: '10:27', status: 'ok', durationMs: 1000, exitCode: 0, argsPreview: 'bun test markdown', text: '内容丢失、嵌套链接与安全边界用例全绿' }),
    message({ id: 'tool-final-bw', kind: 'tool', toolName: 'bash', createdAt: '10:28', status: 'ok', durationMs: 4800, exitCode: 0, argsPreview: 'bw s look --out /tmp/pai-mobile.png', text: '无溢出，错误为零' }),
    message({ id: 'status-final', kind: 'status', text: 'Markdown 与完整 Mock 交付', status: 'ok', durationMs: 96000, summary: '审查问题清零', createdAt: '10:29' }),
    message({ id: 'assistant-delivery-2', kind: 'assistant', text: deliverySummary, createdAt: '10:29' }),

    // 第六轮：工具问答
    message({ id: 'user-6', kind: 'user', text: '称子agent 还在执行任务，我问你，bw工具好用吗，', createdAt: '10:40' }),
    message({ id: 'assistant-bw-review', kind: 'assistant', text: bwReview, createdAt: '10:41' }),

    // 第七、八轮：按真实事件流扩充 Mock（收尾留运行态）
    message({ id: 'user-7', kind: 'user', text: '根据 events.jsonl 加mock数据你加了吗', createdAt: '10:50' }),
    message({ id: 'assistant-honest', kind: 'assistant', text: '加了，但此前只按事件形态自造内容，主线没有对齐真实会话。现在按真实轮次与工具序列重做。', createdAt: '10:51' }),
    message({ id: 'user-8', kind: 'user', text: '现在一个对话数据太少了，参考 events.jsonl 这个真实 agent 执行的任务数据', createdAt: '10:55' }),
    message({ id: 'think-7', kind: 'thinking', text: '把七轮主线、失败链、子代理报告与状态变化全部纳入，形成可直读的完整消息列表。', createdAt: '10:55', status: 'ok' }),
    message({ id: 'tool-mine-events', kind: 'tool', toolName: 'bash', createdAt: '10:56', status: 'running', durationMs: 3200, exitCode: null, argsPreview: 'python3 tools/mine_events.py events.jsonl', text: '正在汇总 7 轮执行数据…' }),
  ],
};
