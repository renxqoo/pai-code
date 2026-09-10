/** worker 级统计查询的目标集：仅 live 会话（parked 查询会唤醒 worker——T27 读不唤醒）。 */
export function statsTargetsOf(sessions: Readonly<Record<string, { state: string }>>): string[] {
  return Object.keys(sessions).filter((threadId) => sessions[threadId]?.state === 'live');
}
