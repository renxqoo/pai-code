/**
 * 对话流执行过程的共享派生层：PC 与移动端的工具执行展示（类别判定、命令摘要、
 * 状态前缀、并行批次聚合、文件级 diff 归并、开合策略）共用这一套纯函数，
 * 行为与文案口径只在这里定义一次。React 无关，文案经 ToolCopy 注入。
 * 类型真相在 @paiapp/contracts（ToolCallView / EditHunkView / ToolCallStatus）。
 */

export type {
  EditCallRef,
  ToolCallRef,
  ToolDetailRef,
  ToolNameRef,
  ToolOutputRef,
  ToolStatusRef,
} from './tool-refs';
export type { ToolCopy } from './tool-copy';
export type { ToolKind } from './tool-kind';
export { toolKindOf, toolPreviewMono } from './tool-kind';
export type { ToolIconKey } from './tool-icon-key';
export { toolGroupIconKey, toolIconKey } from './tool-icon-key';
export { toolSummary } from './tool-summary';
export { toolRowLabel, toolRowLabelOf } from './tool-row-label';
export type { GroupBucketKind, GroupSummaryInput, SummaryBucketKind, ToolGroupBucket } from './tool-group-summary';
export {
  toolGroupBuckets,
  toolGroupIsParallel,
  toolGroupLabel,
  toolGroupStatus,
  toolGroupSummary,
} from './tool-group-summary';
export type { HunkLine } from './hunk-lines';
export { allHunkLines, hunkLines } from './hunk-lines';
export type { FileDiffGroup } from './edit-file-groups';
export { groupEditsByFile } from './edit-file-groups';
export { objectName } from './file-object-name';
export { autoOpenForCall, autoOpenForGroup, callExpandable, detailOutput } from './tool-call-detail';
export { changedFileCount } from './changed-file-count';
export type { RetryCopy } from './retry-copy';
export { retryLineOf, retryReasonLabel } from './retry-copy';
