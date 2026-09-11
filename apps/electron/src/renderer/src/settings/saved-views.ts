import type { SavedSessionView } from '@paiapp/contracts';

/** 已保存会话的渲染层视图（settings 历史分区与新建任务页已知目录共用）。 */
export type SavedSessionEntry = {
  sessionPath: string
  title: string
  cwd: string
  modifiedAt: number
  messageCount: number
}

/** saved 协议视图 → 展示条目：无名回落首条消息截 40（单一真相，原 useLiveWorkspace 派生同构迁出）。 */
export function savedSessionEntries(saved: readonly SavedSessionView[]): readonly SavedSessionEntry[] {
  return saved.map((session) => ({
    sessionPath: session.sessionPath,
    title: session.name ?? session.firstMessage.slice(0, 40),
    cwd: session.cwd,
    modifiedAt: session.modifiedAt,
    messageCount: session.messageCount,
  }));
}
