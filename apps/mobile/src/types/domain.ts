import type { EditHunkView, SubagentSpawnView, ToolCallStatus } from '@paiapp/contracts';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';
// host permission 值域（R2 M-1 对齐——PROFILE_IDS 子集）
export type PermissionMode = 'edit-confirm' | 'auto' | 'plan' | 'full';
export type RuntimeStatus = 'idle' | 'working' | 'paused';

export type ModelOption = {
  id: string;
  name: string;
  provider: string;
  description: string;
  accent: string;
};

export type AttachmentKind = 'image' | 'pdf' | 'document' | 'archive';
export type AttachmentStatus = 'preparing' | 'ready' | 'failed';

export type Attachment = {
  id: string;
  name: string;
  size: number;
  kind: AttachmentKind;
  status: AttachmentStatus;
  uri?: string;
};

export type MessageKind = 'user' | 'assistant' | 'system' | 'thinking' | 'tool' | 'code' | 'status';

export type ChatMessage = {
  id: string;
  kind: MessageKind;
  /** 正文（tool 行 = 执行输出，只进详情 Sheet，不进消息列表） */
  text: string;
  createdAt: string;
  /** 运行态与终态（词表同 contracts ToolCallStatus；tool/thinking/status 行共用一套） */
  status?: ToolCallStatus;
  durationMs?: number;
  /** code 工件的文件名 */
  title?: string;
  language?: string;
  lineCount?: number;
  /** status 信封的补充摘要 */
  summary?: string;
  attachments?: readonly Attachment[];
  /** tool：工具名（bash/read/edit/task…；类别判定与状态前缀从这里派生） */
  toolName?: string;
  /** tool：参数摘要原文（保留换行；行内单行摘要由 toolSummary 折平） */
  argsPreview?: string;
  /** tool：退出码（null = 尚未结束；只有失败行展示） */
  exitCode?: number | null;
  /** edit 工具的补丁片段（同一文件多次编辑按 path 归并成一个 diff） */
  editHunks?: readonly EditHunkView[];
  /** task 工具的子代理执行清单 */
  subagents?: readonly SubagentSpawnView[];
};

export type SessionState = 'idle' | 'working' | 'paused';

export type ConversationSession = {
  id: string;
  title: string;
  preview: string;
  project: string;
  timeLabel: string;
  state: SessionState;
  pinned: boolean;
  archived: boolean;
  unread: boolean;
  /**
   * 会话文件已落盘但桌面端宿主未在册（thread/list 无表项）。手机端无会话文件路径，
   * 既读不到历史也唤不活——UI 显式标注，避免用户对着空会话反复发送。
   */
  detached?: boolean;
  startedAtMs?: number;
  endedAtMs?: number;
  messages: readonly ChatMessage[];
};

export type WorkspaceOption = {
  id: string;
  name: string;
  path: string;
  connected: boolean;
};
