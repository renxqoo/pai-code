/** 侧栏会话卡片的展示字段（会话真相在 hub，这里只承载 UI 状态）。 */
export type SessionCardModel = {
  id: string;
  conversationId: string;
  projectName: string;
  title: string;
  version: string;
  lastActivityAt: number;
};
