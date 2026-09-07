/**
 * 受限 Markdown 解析（纯函数，供对话正文渲染）。
 * 只支持 agent 回复的常用子集：段落、标题、fenced 代码块、有序/无序列表，
 * 行内 粗体/斜体/行内代码/链接。输出结构化块，不产生 HTML——渲染层逐段映射 React 节点，
 * 链接仅放行 http(s) 协议，其余降级为纯文本。
 */

export type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'emphasis'; value: string }
  | { kind: 'link'; value: string; href: string };

export type MarkdownBlock =
  | { kind: 'paragraph'; segments: readonly InlineSegment[] }
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'list'; ordered: boolean; items: readonly (readonly InlineSegment[])[] };

const INLINE_PATTERN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

/** 链接目标仅放行 http(s)，杜绝 javascript:/file: 等协议注入 */
export function safeLinkHref(href: string): string | null {
  return /^https?:\/\//.test(href) ? href : null;
}

export function parseInlineSegments(line: string): readonly InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;
  for (const match of line.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: 'text', value: line.slice(cursor, start) });
    cursor = start + token.length;
    if (token.startsWith('`')) {
      segments.push({ kind: 'code', value: token.slice(1, -1) });
      continue;
    }
    if (token.startsWith('**')) {
      segments.push({ kind: 'strong', value: token.slice(2, -2) });
      continue;
    }
    if (token.startsWith('*')) {
      segments.push({ kind: 'emphasis', value: token.slice(1, -1) });
      continue;
    }
    const split = token.indexOf('](');
    const value = token.slice(1, split);
    const rawHref = token.slice(split + 2, -1);
    const href = safeLinkHref(rawHref);
    if (href === null) {
      segments.push({ kind: 'text', value: token });
      continue;
    }
    segments.push({ kind: 'link', value, href });
  }
  if (cursor < line.length) segments.push({ kind: 'text', value: line.slice(cursor) });
  return segments;
}

const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)\s*$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function parseMarkdown(text: string): readonly MarkdownBlock[] {
  const lines = text.split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence !== null) {
      const lang = fence[1] ?? '';
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length) {
        const fenceLine = lines[index];
        if (fenceLine === undefined || fenceLine.trim() === '```') break;
        codeLines.push(fenceLine);
        index += 1;
      }
      // 未闭合的围栏按到文末处理，不丢弃内容
      if (index < lines.length) index += 1;
      blocks.push({ kind: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    const listMatch = LIST_ITEM.exec(line);
    if (listMatch?.[2] !== undefined && listMatch[3] !== undefined) {
      const ordered = /\d/.test(listMatch[2]);
      const items: InlineSegment[][] = [];
      while (index < lines.length) {
        const rawLine = lines[index];
        if (rawLine === undefined) break;
        const item = LIST_ITEM.exec(rawLine);
        if (item?.[2] === undefined || item[3] === undefined) break;
        if (/\d/.test(item[2]) !== ordered) break;
        items.push([...parseInlineSegments(item[3].trim())]);
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const rawLine = lines[index];
      if (
        rawLine === undefined ||
        rawLine.trim().length === 0 ||
        FENCE_OPEN.exec(rawLine) !== null ||
        HEADING.exec(rawLine) !== null ||
        LIST_ITEM.exec(rawLine) !== null
      ) {
        break;
      }
      paragraphLines.push(rawLine.trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', segments: parseInlineSegments(paragraphLines.join(' ')) });
  }

  return blocks;
}
