export type ThemePreference = 'light' | 'dark' | 'system';
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';
export type PermissionMode = 'ask' | 'auto' | 'plan';
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

export type MessageKind = 'user' | 'assistant' | 'system' | 'thinking' | 'tool' | 'code';

export type ChatMessage = {
  id: string;
  kind: MessageKind;
  text: string;
  createdAt: string;
  title?: string;
  language?: string;
  attachments?: readonly Attachment[];
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
  messages: readonly ChatMessage[];
};

export type WorkspaceOption = {
  id: string;
  name: string;
  path: string;
  connected: boolean;
};
