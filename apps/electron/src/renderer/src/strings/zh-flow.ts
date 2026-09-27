/** 对话流文案（中文；key 结构与 enFlow 逐字段对齐，类型强制同步）。 */
import type { enFlow } from './en-flow';
import {
  bashImagesRejectedCopy,
  imagesDeniedCopy,
  imagesTooManyCopy,
  noActiveSessionCopy,
  resumeFailedCopy,
} from './zh-error-copy';

export const zhFlow: typeof enFlow = {
  openDiff: '打开 Diff',
  steerPlaceholder: '向该子智能体注入指令…',
  steerFailed: (reason: string): string => `改向失败（${reason}）。`,
  /** 思考档词表外值（hub 静默忽略——渲染层先行拒绝提示） */
  thinkingInvalid: '该思考档不可用。',
  /** 思考档写入被 hub 拒绝（reason 为 hub 错误文案） */
  thinkingRejected: (reason: string): string => `思考档未应用：${reason}。`,
  /** 会话域写动作无定址目标（工作区无任何会话时的空舞台） */
  noActiveSession: noActiveSessionCopy,
  /** 会话模型切换被 hub 拒绝（reason 为 hub 错误文案） */
  modelRejected: (reason: string): string => `模型未切换：${reason}。`,
  /** 子代理状态词（running|idle|stopped → 工作中/空闲/已归档） */
  subagentBusy: '工作中',
  subagentIdle: '空闲',
  subagentArchived: '已归档',
  subagentFailed: '失败',
  /** 子代理权限请求信息行（协议无应答命令，hub 到期自动拒绝） */
  subagentAskPending: (toolName: string): string => `等待确认（${toolName}），超时自动拒绝`,
  workingFor: '已工作',
  workedFor: '共工作',
  captionMinimize: '最小化',
  captionMaximize: '最大化',
  captionRestore: '还原',
  captionClose: '关闭',
  agentsWorking: (count: number): string => `${count} 个子智能体工作中，打开 Agents 面板`,
  changedFiles: (count: number): string => (count === 1 ? '1 个文件变更' : `${count} 个文件变更`),
  toggleAgents: '切换子智能体面板',
  toggleDiff: '切换 Diff 面板',
  agentsPanelEmpty: '尚未派生子智能体',
  diffPanelEmpty: '本会话暂无文件变更',
  executing: '正在执行…',
  toolStopped: '已停止',
  toolRunning: '运行中',
  /** 并行执行组的标题短语（不带计数——执行过程是脚注，标题从简） */
  groupBashPhrase: '运行了命令',
  groupListPhrase: '列出了目录',
  groupEditPhrase: '编辑了文件',
  groupReadPhrase: '阅读了文件',
  groupSearchPhrase: '搜索了',
  groupSubagentPhrase: '派生了子智能体',
  /** 未知工具桶：直接点名工具（混合桶超过列举上限以「等」收口） */
  groupOtherPhrase: (name: string): string => `调用了${name}`,
  groupMorePhrase: '等',
  groupPhraseJoin: (phrases: readonly string[]): string => phrases.join(''),
  /** 并行执行组标题的无障碍名（图标装饰位，语义由标题文字承担） */
  groupTitleAria: '工具执行组',
  /** 文件内容面板头（read 工具详情） */
  fileContentLabel: '文件内容',
  /** 单条执行行的已完成前缀（状态写进动词：已阅读文件 / 已运行命令） */
  rowDoneBash: '已运行命令',
  rowDoneRead: '已阅读文件',
  rowDoneEdit: '已编辑文件',
  rowDoneWrite: '已写入文件',
  rowDoneSearch: '已搜索',
  rowDoneList: '已列出目录',
  rowDoneSubagent: '已派生子智能体',
  rowDoneOther: (name: string): string => `已调用${name}`,
  /** 单条执行行的运行中前缀（进行时，与已完成态区分） */
  rowRunningBash: '正在运行命令',
  rowRunningRead: '正在阅读文件',
  rowRunningEdit: '正在编辑文件',
  rowRunningWrite: '正在写入文件',
  rowRunningSearch: '正在搜索',
  rowRunningList: '正在列出目录',
  rowRunningSubagent: '正在派生子智能体',
  rowRunningOther: (name: string): string => `正在调用${name}`,
  /** 思考单元收起态标签（运行中同显 思考，运行态由脉冲点区分） */
  thought: '思考',
  turnStoppedSummary: (elapsed: string): string => `已停止 · ${elapsed}`,
  /** 历史轮左缘锚点（无障碍名） */
  turnAnchorAria: (time: string): string => `查看 ${time} 结束的轮次`,
  /** 历史轮锚点带（无障碍名） */
  turnAnchorRailAria: '历史轮次导航',
  thinking: '思考',
  retrying: (attempt: number): string => `重试中（第 ${attempt} 次）`,
  crashedBanner: '本会话的执行进程已退出。发送消息将恢复会话并继续。',
  hydrateFailedTitle: '历史加载失败',
  hydrateFailedHint: '未能读取该会话的历史记录，可重试。',
  compacting: '正在压缩上下文…',
  bashRunning: '正在执行命令…',
  bashFailed: (reason: string): string => `命令未执行（${reason}）。`,
  editRerun: '编辑并重开（分叉）',
  retryFromHere: '从这里重试',
  forkFailed: '分叉会话失败，请重试。',
  /** 流式中的 fork 被 hub 拒绝（thread is streaming）：先停止会话再分叉 */
  forkStreaming: '会话正在回复中，请先停止会话再分叉。',
  /** 队列单条操作落空（queue/drop、queue/send_now 撞上条目已入轮/已清空的竞态——中性表述，
   *  入轮与 abort 清空两条路径都成立） */
  queuedEntryConsumed: '该消息已不在排队中。',
  /** 立即改向落空（无运行中的轮次可注入；条目留在队列随下轮消费） */
  queuedSendNowUnavailable: '当前没有进行中的回复，消息仍留在排队中。',
  /** 队列单条操作其余失败（传输/暂态等；不猜测条目现状） */
  queueOpFailed: '操作失败，请重试。',
  forkedImageName: (index: number): string => `图片 ${index}`,
  resumeFailed: resumeFailedCopy,
  stopConfirmTitle: '停止全部任务？',
  stopConfirmHint: '将终止全部前台与后台子智能体，且不可恢复。',
  stopConfirmYes: '全部停止',
  stopConfirmNo: '取消',
  bashNoImages: bashImagesRejectedCopy,
  imagesDenied: imagesDeniedCopy,
  imagesTooMany: imagesTooManyCopy,
  compactionSummaryLabel: (n: number): string => `已压缩前 ${n} 轮对话`,
  compactionSummaryLabelNoCount: '已压缩历史对话',
  systemMessageLabel: '系统',
  sendFailed: (reason: string): string => `消息未发送（${reason}），请重试。`,
  toolFailed: (exitCode: number): string => `退出码 ${exitCode}`,
  copyMessage: '复制消息',
  editMessage: '编辑消息',
  scrollToBottom: '回到底部',
  copyCommand: '复制命令',
  copyOutput: '复制输出',
  copied: '已复制',
  outputLabel: '输出',
  toggleOutput: '展开/收起命令输出',
  panelWorking: (count: number): string => (count === 1 ? '1 个进行中' : `${count} 个进行中`),
  panelSettled: (count: number): string => (count === 1 ? '1 个已完成' : `${count} 个已完成`),
  footerTokens: (tokens: string): string => `Σ ${tokens} tok`,
  metaTokens: (tokens: string | null): string => (tokens === null ? '— tok' : `${tokens} tok`),
  metaTools: (count: number): string | null => {
    if (count <= 0) return null;
    return count === 1 ? '1 个工具' : `${count} 个工具`;
  },};
