/**
 * 会话自动命名的标题语料判定（纯函数）：
 * 行首 `/` 的斜杠命令（hub 拦截型 /compact、技能、模板）不是标题语料——
 * 它们是操作不是对会话内容的描述，作为标题会把未命名会话永久改名为命令文本。
 * 命名形态：空白折叠为单空格、截断 48 字符；空语料返回 null（不命名）。
 */
export function autoTitleCandidateOf(message: string): string | null {
  if (message.startsWith('/')) return null;
  const name = message.replace(/\s+/g, ' ').trim().slice(0, 48);
  return name.length > 0 ? name : null;
}
