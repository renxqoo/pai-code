import type { ConversationSession, WorkspaceOption } from '@/types/domain';

export const workspaces: readonly WorkspaceOption[] = [
  { id: 'workspace-pai', name: 'agent-app', path: '~/work/agent-app', connected: true },
  { id: 'workspace-mobile', name: 'Pai Mobile', path: '~/work/pai-mobile', connected: false },
  { id: 'workspace-docs', name: '产品文档', path: '~/Documents/Pai', connected: false },
  { id: 'workspace-archive', name: '归档项目', path: '~/Projects/archive', connected: false },
];

export const demoSessions: readonly ConversationSession[] = [
  {
    id: 'session-refactor', title: '重构消息列表并补充测试', preview: '已拆分消息与执行步骤组件…', project: 'agent-app', timeLabel: '10:42', state: 'working', pinned: true, archived: false, unread: false,
    messages: [
      { id: 'user-1', kind: 'user', text: '重构消息列表，补充覆盖空态与工具调用的测试。', createdAt: '10:40' },
      { id: 'thinking-1', kind: 'thinking', text: '我先检查现有消息模型和渲染边界，再从最小可验证切片开始。', createdAt: '10:40' },
      { id: 'tool-1', kind: 'tool', title: '检查 message-list.tsx', text: '读取了 8 个文件，发现工具块和助手消息共用同一时间线。', createdAt: '10:41' },
      { id: 'assistant-1', kind: 'assistant', text: '我会保持现有时间线行为，把空态、消息与执行步骤拆成独立展示边界，并为每种消息形态补测试。', createdAt: '10:41' },
      { id: 'code-1', kind: 'code', title: 'MessageList.tsx', language: 'tsx', text: 'return (\n  <MessageTimeline items={items} />\n);', createdAt: '10:42' },
    ],
  },
  { id: 'session-mobile', title: 'Pai Mobile 视觉走查', preview: '对比了 Android 与 iOS 的安全区…', project: 'Pai Mobile', timeLabel: '09:18', state: 'idle', pinned: false, archived: false, unread: true,
    messages: [
      { id: 'user-mobile', kind: 'user', text: '把移动端界面改成更克制的 Pai 风格。', createdAt: '09:15' },
      { id: 'assistant-mobile', kind: 'assistant', text: '我会延续桌面的中性色与细边框，降低移动端标题尺度，并强化列表与输入区域的操作反馈。', createdAt: '09:18' },
    ] },
  { id: 'session-release', title: '检查发布前变更', preview: '发现 2 个待修复的 Android 权限问题。', project: 'agent-app', timeLabel: '昨天', state: 'paused', pinned: false, archived: false, unread: false,
    messages: [{ id: 'assistant-release', kind: 'assistant', text: '发布检查已完成大部分，仍有两个 Android 权限问题需要处理。', createdAt: '昨天' }] },
  { id: 'session-docs', title: '整理 API 设计文档', preview: '已生成首版接口目录与错误码表。', project: '产品文档', timeLabel: '周一', state: 'idle', pinned: false, archived: false, unread: false,
    messages: [{ id: 'assistant-docs', kind: 'assistant', text: '设计文档已经按资源、请求、结果和错误四部分整理。', createdAt: '周一' }] },
  { id: 'session-old', title: '升级构建工具链', preview: '构建耗时降低约 18%。', project: 'agent-app', timeLabel: '7 月 18 日', state: 'idle', pinned: false, archived: true, unread: false,
    messages: [{ id: 'assistant-old', kind: 'assistant', text: '工具链升级完成，冷构建缓存命中率已经稳定。', createdAt: '7 月 18 日' }] },
];
