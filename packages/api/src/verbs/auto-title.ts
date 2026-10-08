/**
 * 会话自动命名的标题语料判定（纯函数）。
 *
 * 命令词形（行首 `/name` 或 `/skill:name`，name 为单段——不含 `/`）是操作不是
 * 对会话内容的描述：语料取其后随文本（用户随命令表达的意图），无后随文本才
 * 不命名。首词含内嵌 `/`（如 `/Users/...` 绝对路径开头的提问）不是命令词形，
 * 整条消息即语料——按命令误杀会让这类会话永远停留在默认标题。
 * 命名形态：空白折叠为单空格、截断 48 字符；空语料返回 null（不命名）。
 */
export function autoTitleCandidateOf(message: string): string | null {
  const corpus = leadingCommandArgsOf(message) ?? message;
  const name = corpus.replace(/\s+/g, ' ').trim().slice(0, 48);
  return name.length > 0 ? name : null;
}

const LEADING_COMMAND = /^\/(?:[\w.-]+(?::[\w.-]+)?)(?:\s+(.*))?$/s;

/** 行首命令词形（`/compact`、`/skill:writer 写一段`）→ 其后随文本（无参数为空串）；非命令词形返回 null。 */
function leadingCommandArgsOf(message: string): string | null {
  const matched = LEADING_COMMAND.exec(message);
  return matched === null ? null : matched[1] ?? '';
}
