/**
 * 会话文件路径索引（threadId → sessionPath）：唤活（thread/resume）与桌面端
 * 偏好键域共用的同一份事实。独立成文件是因为 runtime 同时管装配、路由与
 * 索引三件事，索引面单独可测。
 */
const threadPaths = new Map<string, string>();

/** 记录一批 thread/list（threadId 键）或 thread/list_saved（sessionId 键）行。 */
export function noteThreadPaths(sessions: Array<Record<string, unknown>>): void {
  for (const raw of sessions) {
    const threadId = idOf(raw);
    const sessionPath = raw['sessionPath'];
    if (threadId.length > 0 && typeof sessionPath === 'string') threadPaths.set(threadId, sessionPath);
  }
}

/** 行标识（thread/list 用 threadId，thread/list_saved 用 sessionId——同一 id 域）。 */
function idOf(raw: Record<string, unknown>): string {
  const threadId = typeof raw['threadId'] === 'string' ? (raw['threadId'] as string) : '';
  return threadId.length > 0 ? threadId : typeof raw['sessionId'] === 'string' ? (raw['sessionId'] as string) : '';
}

/** 记录单个 threadId → sessionPath（resume 换发新 id 后）。 */
export function noteThreadPath(threadId: string, sessionPath: string): void {
  if (threadId.length > 0 && sessionPath.length > 0) threadPaths.set(threadId, sessionPath);
}

export function threadPathOf(threadId: string): string | null {
  return threadPaths.get(threadId) ?? null;
}