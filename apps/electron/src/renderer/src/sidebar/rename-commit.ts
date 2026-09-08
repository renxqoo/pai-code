/**
 * 行内重命名提交值裁决：trim 后为空或与原标题相同 = 取消（null）。
 * 从旧会话卡片原样迁移的语义，抽纯函数钉住回归。
 */
export function renameCommitValue(draft: string, currentTitle: string): string | null {
  const trimmed = draft.trim();
  if (trimmed.length === 0 || trimmed === currentTitle) return null;
  return trimmed;
}
