/**
 * 补全触发语义（纯函数，composer 交互的唯一真相）：
 * 触发字符（`/` 命令、`@` 文件）位于行首或空白后、且 token 内（触发符与
 * caret 之间）无空白才激活；激活时返回触发符之后的查询串（可能为空串——
 * 注意用 !== null 判激活）。
 */

export type TokenTrigger = '/' | '@';

function tokenStart(text: string, caret: number, trigger: TokenTrigger): number | null {
  let i = Math.min(caret, text.length);
  while (i > 0) {
    const ch = text[i - 1] ?? '';
    if (/\s/.test(ch)) return null;
    if (ch === trigger) {
      return i - 1 === 0 || /\s/.test(text[i - 2] ?? '') ? i - 1 : null;
    }
    i -= 1;
  }
  return null;
}

/** caret 所在 token 的查询串；未激活返回 null。 */
export function activeTokenQuery(text: string, caret: number, trigger: TokenTrigger): string | null {
  const start = tokenStart(text, caret, trigger);
  return start === null ? null : text.slice(start + 1, Math.min(caret, text.length));
}

/** 采纳条目：把 caret 前的 token 替换为 `触发符 + name + 空格`（caret 后文本保留）。
 * name 已含触发符原样使用；无激活 token（caret 与状态脱节的兜底路径）时原样返回，绝不盲插。 */
export function applyTokenSelection(text: string, caret: number, trigger: TokenTrigger, name: string): { text: string; caret: number } {
  const at = Math.min(caret, text.length);
  const start = tokenStart(text, caret, trigger);
  if (start === null) return { text, caret: at };
  const normalized = name.startsWith(trigger) ? name : `${trigger}${name}`;
  const inserted = `${normalized} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(at),
    caret: start + inserted.length,
  };
}

/** 条目过滤：空查询原样返回（同引用）；非空按 name 大小写不敏感子串匹配。 */
export function filterTokenItems<T extends { name: string }>(items: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return items;
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}
