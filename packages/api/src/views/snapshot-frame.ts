/**
 * 内核尾部快照信封帧谓词（x-harness agent-loop isSnapshotNode 的协议镜像——
 * 消费方禁止字面量匹配，信封识别跨包单一真相）。内核把易变事实（agent 类型表/
 * 日期/项目指令/技能清单）以 user/message（append、单 text 块）落 WAL——它们是
 * 模型上下文，不是对话内容：渲染面按本谓词整帧跳过（cursor 仍推进）。
 * 四重合取与内核一致：user/message ∧ surfaceOp=append ∧ 单 text 块 ∧ 信封首行
 * + 次行作废声明；kind 任意（新增快照种类免改）。
 */

const SNAPSHOT_SUPERSEDES = 'This snapshot supersedes earlier snapshots of this kind.';

export function isSnapshotFrame(event: Record<string, unknown>): boolean {
  if (event['type'] !== 'user/message' || event['surfaceOp'] !== 'append') return false;
  const content = event['content'];
  if (!Array.isArray(content) || content.length !== 1) return false;
  const block = content[0];
  if (typeof block !== 'object' || block === null || (block as Record<string, unknown>)['type'] !== 'text') return false;
  const text = (block as Record<string, unknown>)['text'];
  if (typeof text !== 'string') return false;
  const lines = text.split('\n');
  const head = lines[0];
  return typeof head === 'string' && head.startsWith('<snapshot kind="') && head.endsWith('>') && lines[1] === SNAPSHOT_SUPERSEDES;
}
