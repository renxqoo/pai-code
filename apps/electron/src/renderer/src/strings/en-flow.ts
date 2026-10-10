/** 对话流文案（英文；key 结构 = 唯一真相，zh 表按同形状翻译）。 */
import type { RetryCopy } from '@x3code/ui-thread';
import { retryLineOf } from '@x3code/ui-thread';
import {
  bashImagesRejectedCopy,
  imagesDeniedCopy,
  imagesTooManyCopy,
  noActiveSessionCopy,
  resumeFailedCopy,
} from './en-error-copy';

/** 重试行词面（共享拼装入 @x3code/ui-thread，两端同一句）：hub 错误码 → 原因短语。 */
export const enRetryCopy: RetryCopy = {
  reasonHttp429: 'Rate limited',
  reasonHttp408: 'Request timed out',
  reasonHttp5xx: 'Upstream service unavailable',
  reasonNetwork: 'Network interrupted',
  reasonRepetition: 'Repetitive output detected, retrying differently',
  reasonFallback: 'Temporarily unavailable',
  retryingLabel: (attempt: number): string => `Retrying (attempt ${attempt})`,
};

export const enFlow = {
  openDiff: 'Open Diff',
  steerPlaceholder: 'Steer this agent…',
  steerFailed: (reason: string): string => `Steering failed (${reason}).`,
  /** 思考档词表外值（hub 静默忽略——渲染层先行拒绝提示） */
  thinkingInvalid: 'That thinking level is not available.',
  /** 思考档写入被 hub 拒绝（reason 为 hub 错误文案） */
  thinkingRejected: (reason: string): string => `Thinking level not applied: ${reason}.`,
  /** 会话域写动作无定址目标（工作区无任何会话时的空舞台） */
  noActiveSession: noActiveSessionCopy,
  /** 会话模型切换被 hub 拒绝（reason 为 hub 错误文案） */
  modelRejected: (reason: string): string => `Model not applied: ${reason}.`,
  /** 子代理状态词（running|idle|stopped → 工作中/空闲/已归档） */
  subagentBusy: 'Working',
  subagentIdle: 'Idle',
  subagentArchived: 'Archived',
  subagentFailed: 'Failed',
  /** 子代理权限请求信息行（协议无应答命令，hub 到期自动拒绝） */
  subagentAskPending: (toolName: string): string => `Waiting for permission (${toolName}) — auto-denied on timeout`,
  workingFor: 'Working for',
  workedFor: 'Worked for',
  /** Windows caption 三键（自绘标题栏） */
  captionMinimize: 'Minimize',
  captionMaximize: 'Maximize',
  captionRestore: 'Restore',
  captionClose: 'Close',
  /** 输入框徽标：工作子代理计数（按钮无障碍名） */
  agentsWorking: (count: number): string =>
    count === 1 ? '1 agent working — open the Agents panel' : `${count} agents working — open the Agents panel`,
  /** 折叠摘要：375 changed files */
  changedFiles: (count: number): string => (count === 1 ? '1 changed file' : `${count} changed files`),
  toggleAgents: 'Toggle agents panel',
  toggleDiff: 'Toggle diff panel',
  agentsPanelEmpty: 'No agents spawned yet',
  diffPanelEmpty: 'No file changes in this session yet',
  executing: 'Working…',
  toolStopped: 'Stopped',
  toolRunning: 'Running',
  /** Parallel batch header phrases (no counts — execution is a footnote) */
  groupBashPhrase: 'Ran commands',
  groupListPhrase: 'Listed directories',
  groupEditPhrase: 'Edited files',
  groupReadPhrase: 'Read files',
  groupSearchPhrase: 'Searched',
  groupSubagentPhrase: 'Spawned an agent',
  /** Unknown-tool bucket: name the tool, capped with a trailing "and others" */
  groupOtherPhrase: (name: string): string => `Called ${name}`,
  groupMorePhrase: 'and others',
  groupPhraseJoin: (phrases: readonly string[]): string => phrases.join(', '),
  /** Counted title of a whole-turn process group (the verb-phrase form above still serves per-message batches) */
  groupCountEdit: (count: number): string => `Edited ${count} ${count === 1 ? 'file' : 'files'}`,
  groupCountThinking: (count: number): string => `Thought ${count} ${count === 1 ? 'time' : 'times'}`,
  groupCountRead: (count: number): string => `Read ${count} ${count === 1 ? 'file' : 'files'}`,
  groupCountSearch: (count: number): string => `Searched ${count} ${count === 1 ? 'time' : 'times'}`,
  groupCountList: (count: number): string => `Listed ${count} ${count === 1 ? 'directory' : 'directories'}`,
  groupCountBash: (count: number): string => `Ran ${count} ${count === 1 ? 'command' : 'commands'}`,
  groupCountSubagent: (count: number): string => `Spawned ${count} ${count === 1 ? 'agent' : 'agents'}`,
  groupCountOther: (count: number, name: string): string => (name.length > 0 ? `Called ${name} ${count} ${count === 1 ? 'time' : 'times'}` : `Called a tool ${count} ${count === 1 ? 'time' : 'times'}`),
  groupCountJoin: (phrases: readonly string[]): string => phrases.join(', '),
  /** Accessible name of the parallel batch header icon (decorative slot) */
  groupTitleAria: 'Tool execution group',
  /** Accessible name of a whole-turn process group header */
  processGroupTitleAria: 'Execution process',
  /** File-content panel header (read tool detail) */
  fileContentLabel: 'File content',
  /** Single-call row prefix in the past tense (status carried by the verb) */
  rowDoneBash: 'Ran command',
  rowDoneRead: 'Read file',
  rowDoneEdit: 'Edited file',
  rowDoneWrite: 'Wrote file',
  rowDoneSearch: 'Searched',
  rowDoneList: 'Listed directory',
  rowDoneSubagent: 'Spawned agent',
  rowDoneOther: (name: string): string => `Called ${name}`,
  /** Single-call failure prefix (whole clause, not just a red exit code) */
  rowFailed: 'Failed',
  rowStopped: 'Stopped',
  rowFailedOther: (name: string): string => `Failed: ${name}`,
  rowStoppedOther: (name: string): string => `Stopped: ${name}`,
  /** Single-call row prefix in the present continuous (running state) */
  rowRunningBash: 'Running command',
  rowRunningRead: 'Reading file',
  rowRunningEdit: 'Editing file',
  rowRunningWrite: 'Writing file',
  rowRunningSearch: 'Searching',
  rowRunningList: 'Listing directory',
  rowRunningSubagent: 'Spawning agent',
  rowRunningOther: (name: string): string => `Calling ${name}`,
  /** Collapsed-turn change summary suffix */
  turnChangedFiles: (count: number): string => `· ${count} file${count === 1 ? '' : 's'} changed`,
  /** 思考单元收起态标签（运行中显 Thinking） */
  thought: 'Thought',
  /** 中断轮次的状态行：Stopped · 8m 0s */
  turnStoppedSummary: (elapsed: string): string => `Stopped · ${elapsed}`,
  /** 历史轮左缘锚点（无障碍名）：View the turn finished at 10:46 AM */
  turnAnchorAria: (time: string): string => `View the turn finished at ${time}`,
  /** 历史轮锚点带（无障碍名） */
  turnAnchorRailAria: 'Turn history navigation',
  thinking: 'Thinking',
  /** 重试行整句：拼装单点在 @x3code/ui-thread/retry-copy（词面注入，两端同句）。 */
  retryLine: (attempt: number, code: string | null): string => retryLineOf(attempt, code, enRetryCopy),
  crashedBanner: 'This conversation\'s worker has exited. Sending a message resumes the session.',
  hydrateFailedTitle: 'Failed to load history',
  hydrateFailedHint: 'Could not read this conversation\'s history. You can retry.',
  compacting: 'Compacting context…',
  bashRunning: 'Running command…',
  editRerun: 'Edit & rerun (fork)',
  retryFromHere: 'Retry from here',
  forkFailed: 'Forking the conversation failed. Try again.',
  /** 流式中的 fork 被 hub 拒绝（thread is streaming）：先停止会话再分叉 */
  forkStreaming: 'The conversation is still streaming. Stop it before forking.',
  /** 队列单条操作落空（queue/drop、queue/send_now 撞上条目已入轮/已清空的竞态——中性表述） */
  queuedEntryConsumed: 'That message is no longer queued.',
  /** 立即改向落空（无运行中的轮次可注入；条目留在队列随下轮消费） */
  queuedSendNowUnavailable: 'No reply is running right now; the message stays queued.',
  /** 队列单条操作其余失败（传输/暂态等；不猜测条目现状） */
  queueOpFailed: 'The operation failed. Please try again.',
  forkedImageName: (index: number): string => `Image ${index}`,
  resumeFailed: resumeFailedCopy,
  stopConfirmTitle: 'Stop everything?',
  stopConfirmHint: 'This terminates all foreground and background agents and cannot be undone.',
  stopConfirmYes: 'Stop all',
  stopConfirmNo: 'Cancel',
  bashNoImages: bashImagesRejectedCopy,
  imagesDenied: imagesDeniedCopy,
  imagesTooMany: imagesTooManyCopy,
  bashFailed: (reason: string): string => `Command not run (${reason}).`,
  systemMessageLabel: 'System',
  sendFailed: (reason: string): string => `Message not sent (${reason}). Try again.`,
  toolFailed: (exitCode: number): string => `exit ${exitCode}`,
  copyMessage: 'Copy message',
  editMessage: 'Edit message',
  scrollToBottom: 'Scroll to latest',
  copyCommand: 'Copy command',
  copyOutput: 'Copy output',
  copied: 'Copied',
  outputLabel: 'Output',
  toggleOutput: 'Toggle command output',
  /** 面板汇总：2 working 3 settled */
  panelWorking: (count: number): string => (count === 1 ? '1 working' : `${count} working`),
  panelSettled: (count: number): string => (count === 1 ? '1 settled' : `${count} settled`),
  /** 面板右下角：Σ 6.6k tok */
  footerTokens: (tokens: string): string => `Σ ${tokens} tok`,
  /** 元信息段：51 tok / — tok */
  metaTokens: (tokens: string | null): string => (tokens === null ? '— tok' : `${tokens} tok`),
  /** 元信息段：7 tools；无工具调用时为 null，整段省略 */
  metaTools: (count: number): string | null => {
    if (count <= 0) return null;
    return count === 1 ? '1 tool' : `${count} tools`;
  },};
