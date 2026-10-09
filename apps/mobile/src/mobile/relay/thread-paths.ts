/**
 * 会话文件路径索引（threadId → sessionPath）：唤活（thread/resume）与桌面端
 * 偏好键域共用的同一份事实。独立成文件是因为 runtime 同时管装配、路由与
 * 索引三件事，索引面单独可测。
 */
const threadPaths = new Map<string, string>();

/** 记录一批 thread/list 行（bootstrap 与按路径收养时）。 */
export function noteThreadPaths(sessions: Array<Record<string, unknown>>): void {
  for (const raw of sessions) {
    const threadId = typeof raw['threadId'] === 'string' ? (raw['threadId'] as string) : '';
    const sessionPath = raw['sessionPath'];
    if (threadId.length > 0 && typeof sessionPath === 'string') threadPaths.set(threadId, sessionPath);
  }
}

/** 记录单个 threadId → sessionPath（resume 换发新 id 后）。 */
export function noteThreadPath(threadId: string, sessionPath: string): void {
  if (threadId.length > 0 && sessionPath.length > 0) threadPaths.set(threadId, sessionPath);
}

export function threadPathOf(threadId: string): string | null {
  return threadPaths.get(threadId) ?? null;
}