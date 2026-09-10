/**
 * 会话状态优先级（顶栏状态 chip 的唯一真相）：
 * 等待权限 > 压缩中 > 运行中 > 排队中 > 空闲。
 * 等待权限最不该被错过（hub 对话框在等用户应答）；排队只在非生成中单独成立
 * （生成中排队是常态，由「运行中」覆盖）。
 */

export type ThreadStatusKind = 'idle' | 'queued' | 'running' | 'compacting' | 'permission';

export type ThreadStatusInput = {
  /** 活跃会话存在待应答对话框（权限/输入类 ui_request）。 */
  permissionWaiting: boolean;
  compacting: boolean;
  generating: boolean;
  queueCount: number;
};

export function threadStatus(input: ThreadStatusInput): ThreadStatusKind {
  if (input.permissionWaiting) return 'permission';
  if (input.compacting) return 'compacting';
  if (input.generating) return 'running';
  if (input.queueCount > 0) return 'queued';
  return 'idle';
}
