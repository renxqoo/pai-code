/**
 * 斜杠补全触发语义（纯函数，composer 交互的唯一真相）：
 * `/` 位于行首或空白后、且 token 内（`/` 与 caret 之间）无空白才激活；
 * 激活时返回 `/` 之后的查询串（可能为空串——注意用 !== null 判激活）。
 */

function slashTokenStart(text: string, caret: number): number | null {
  let i = Math.min(caret, text.length);
  while (i > 0) {
    const ch = text[i - 1] ?? '';
    if (/\s/.test(ch)) return null;
    if (ch === '/') {
      return i - 1 === 0 || /\s/.test(text[i - 2] ?? '') ? i - 1 : null;
    }
    i -= 1;
  }
  return null;
}

/** caret 所在 `/` token 的查询串；未激活返回 null。 */
export function activeSlashQuery(text: string, caret: number): string | null {
  const start = slashTokenStart(text, caret);
  return start === null ? null : text.slice(start + 1, Math.min(caret, text.length));
}

/** 采纳命令：把 caret 前的 `/` token 替换为 `/name `（name 缺前导斜杠时补上，caret 后的文本保留）。 */
export function applySlashSelection(text: string, caret: number, name: string): { text: string; caret: number } {
  const start = slashTokenStart(text, caret);
  const at = start ?? Math.min(caret, text.length);
  const normalized = name.startsWith('/') ? name : `/${name}`;
  const inserted = `${normalized} `;
  return {
    text: text.slice(0, at) + inserted + text.slice(Math.min(caret, text.length)),
    caret: at + inserted.length,
  };
}

/** 命令过滤：空查询原样返回（同引用）；非空按 name 大小写不敏感子串匹配。 */
export function filterSlashItems<T extends { name: string }>(items: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return items;
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}
