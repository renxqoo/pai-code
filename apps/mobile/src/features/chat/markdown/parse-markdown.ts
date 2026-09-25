import MarkdownIt from 'markdown-it';
import type {
  MarkdownBlock,
  MarkdownInline,
  MarkdownListItem,
} from '@/features/chat/markdown/markdown-types';

type MdToken = ReturnType<MarkdownIt['parse']>[number];

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
// 协议安全由渲染层统一裁决：解析层保留 href 原文，非法协议链接降级为纯文本。
md.validateLink = () => true;

// 病态嵌套输入的深度上限：更深层级拍平进当前内容，避免平方级扫描与递归栈溢出。
const maxNestingDepth = 32;

function takeUntil(
  tokens: readonly MdToken[],
  start: number,
  closeType: string,
): { tokens: MdToken[]; end: number } {
  const collected: MdToken[] = [];
  let depth = 1;
  let index = start;
  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (token.nesting === 1 && token.type.replace(/_open$/, '_close') === closeType) depth += 1;
    if (token.type === closeType) {
      depth -= 1;
      if (depth === 0) break;
    }
    collected.push(token);
  }
  return { tokens: collected, end: index };
}

function mapInline(tokens: readonly MdToken[]): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (token.type === 'text') {
      nodes.push({ kind: 'text', text: token.content });
    } else if (token.type === 'strong_open') {
      const inner = takeUntil(tokens, index + 1, 'strong_close');
      nodes.push({ kind: 'strong', content: mapInline(inner.tokens) });
      index = inner.end;
    } else if (token.type === 'em_open') {
      const inner = takeUntil(tokens, index + 1, 'em_close');
      nodes.push({ kind: 'emphasis', content: mapInline(inner.tokens) });
      index = inner.end;
    } else if (token.type === 'code_inline') {
      nodes.push({ kind: 'code', text: token.content });
    } else if (token.type === 'link_open') {
      const inner = takeUntil(tokens, index + 1, 'link_close');
      nodes.push({
        kind: 'link',
        content: mapInline(inner.tokens),
        href: token.attrGet('href') ?? '',
      });
      index = inner.end;
    } else if (token.type === 'image') {
      if (token.content.length > 0) nodes.push({ kind: 'text', text: token.content });
    } else if (token.type === 's_open') {
      const inner = takeUntil(tokens, index + 1, 's_close');
      nodes.push(...mapInline(inner.tokens));
      index = inner.end;
    } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
      nodes.push({ kind: 'text', text: '\n' });
    } else if (token.type === 'html_inline') {
      // 原始 HTML 永不渲染，仅丢弃标签本身。
    } else if (token.content.length > 0) {
      nodes.push({ kind: 'text', text: token.content });
    }
  }
  return nodes.filter((node) => ('text' in node ? node.text.length > 0 : true));
}

function inlineChildren(token: MdToken | undefined): readonly MdToken[] {
  return token?.children ?? [];
}

// 列表项/引用的内容收集：保留全部块级内容（多段落、围栏代码），块间以换行分隔。
// flattenLists=false：嵌套列表跳过（由 collectList 以缩进行单独呈现）；
// flattenLists=true：列表项拍平进内容（引用等无行结构的上下文）。
function contentFromTokens(tokens: readonly MdToken[], flattenLists: boolean, depth: number): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  const push = (next: readonly MarkdownInline[]): void => {
    if (next.length === 0) return;
    if (nodes.length > 0) nodes.push({ kind: 'text', text: '\n' });
    nodes.push(...next);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (token.type === 'inline') {
      push(mapInline(inlineChildren(token)));
    } else if (token.type === 'fence' || token.type === 'code_block') {
      push([{ kind: 'code', text: token.content.replace(/\n$/, '') }]);
    } else if (token.type === 'list_item_open') {
      const item = takeUntil(tokens, index + 1, 'list_item_close');
      if (flattenLists || depth >= maxNestingDepth) push(contentFromTokens(item.tokens, true, depth + 1));
      index = item.end;
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      if (!flattenLists && depth < maxNestingDepth) {
        const closeType = token.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
        const nested = takeUntil(tokens, index + 1, closeType);
        index = nested.end;
      }
    }
  }
  return nodes;
}

function collectList(tokens: readonly MdToken[], indent: number, depth: number): MarkdownListItem[] {
  const items: MarkdownListItem[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type !== 'list_item_open') continue;
    const item = takeUntil(tokens, index + 1, 'list_item_close');
    items.push({ indent, content: contentFromTokens(item.tokens, false, depth) });
    if (depth < maxNestingDepth) {
      items.push(...collectList(item.tokens, indent + 1, depth + 1));
    }
    index = item.end;
  }
  return items;
}

function listStart(open: MdToken): number {
  const parsed = Number(open.attrGet('start'));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function listBlock(tokens: readonly MdToken[], start: number, depth: number): { block: MarkdownBlock; end: number } {
  const open = tokens[start];
  const ordered = open?.type === 'ordered_list_open';
  const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';
  const inner = takeUntil(tokens, start + 1, closeType);
  return {
    block: {
      kind: 'list',
      ordered,
      start: open !== undefined ? listStart(open) : 1,
      items: collectList(inner.tokens, 0, depth),
    },
    end: inner.end,
  };
}

function tableText(tokens: readonly MdToken[]): string {
  return tokens
    .filter((token) => token.type === 'inline')
    .map((token) => token.content)
    .join(' ');
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

function mapBlocks(tokens: readonly MdToken[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (token.type === 'heading_open') {
      blocks.push({
        kind: 'heading',
        level: Number(token.tag.slice(1)) || 1,
        content: mapInline(inlineChildren(tokens[index + 1])),
      });
      index += 2;
    } else if (token.type === 'paragraph_open') {
      blocks.push({
        kind: 'paragraph',
        content: mapInline(inlineChildren(tokens[index + 1])),
      });
      index += 2;
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const list = listBlock(tokens, index, depth);
      blocks.push(list.block);
      index = list.end;
    } else if (token.type === 'blockquote_open') {
      const inner = takeUntil(tokens, index + 1, 'blockquote_close');
      blocks.push({ kind: 'quote', content: contentFromTokens(inner.tokens, true, depth) });
      index = inner.end;
    } else if (token.type === 'fence' || token.type === 'code_block') {
      blocks.push({
        kind: 'code',
        language: token.info.trim().split(/\s+/)[0] ?? '',
        code: token.content.replace(/\n$/, ''),
      });
    } else if (token.type === 'hr') {
      blocks.push({ kind: 'divider' });
    } else if (token.type === 'html_block') {
      const text = stripHtml(token.content);
      if (text.length > 0) blocks.push({ kind: 'paragraph', content: [{ kind: 'text', text }] });
    } else if (token.type === 'table_open') {
      const inner = takeUntil(tokens, index + 1, 'table_close');
      const text = tableText(inner.tokens);
      if (text.length > 0) blocks.push({ kind: 'paragraph', content: [{ kind: 'text', text }] });
      index = inner.end;
    }
  }
  return blocks;
}

export function parseMarkdown(source: string): readonly MarkdownBlock[] {
  if (source.trim().length === 0) return [];
  try {
    return mapBlocks(md.parse(source, {}), 0);
  } catch {
    return [{ kind: 'paragraph', content: [{ kind: 'text', text: source }] }];
  }
}
