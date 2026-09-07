import type { ReactNode } from 'react';

import { parseMarkdown, type MarkdownBlock } from './parse-markdown';
import { CodeBlock } from './code-block';
import { InlineSegments } from './inline-segments';

type MarkdownTextProps = {
  id: string
  text: string
  className?: string
}

const headingClassName: Record<1 | 2 | 3 | 4, string> = {
  1: 'pt-[14px] text-[15px] font-semibold leading-[22px]',
  2: 'pt-[12px] text-[14px] font-semibold leading-[20px]',
  3: 'pt-[10px] text-[13px] font-semibold leading-[19px]',
  4: 'pt-[8px] text-[12.5px] font-semibold leading-[18px]',
};

function renderBlock(id: string, block: MarkdownBlock, index: number): ReactNode {
  const key = `${id}-b${index}`;
  switch (block.kind) {
    case 'heading': {
      // markdown 的 # 是正文内标题，落到 h2 起，h1 留给页面级标题语义
      const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2' | 'h3' | 'h4' | 'h5';
      return (
        <Tag key={key} className={`text-foreground ${headingClassName[block.level]}`}>
          {block.text}
        </Tag>
      );
    }
    case 'code':
      return <CodeBlock key={key} lang={block.lang} code={block.code} />;
    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          key={key}
          className={`flex flex-col gap-[4px] pl-[18px] ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted-foreground/70`}
        >
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} className="min-w-0 pl-[2px]">
              <InlineSegments id={`${key}-${itemIndex}`} segments={item} />
            </li>
          ))}
        </ListTag>
      );
    }
    default:
      return (
        <p key={key} className="min-w-0">
          <InlineSegments id={key} segments={block.segments} />
        </p>
      );
  }
}

/** 对话正文：受限 Markdown 子集渲染（解析为结构块映射 React 节点，不产生 HTML）。 */
function MarkdownText({ id, text, className }: MarkdownTextProps) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;
  return (
    <div
      className={`flex flex-col gap-[10px] text-[12.5px] leading-[21px] text-foreground ${className ?? ''}`.trim()}
    >
      {blocks.map((block, index) => renderBlock(id, block, index))}
    </div>
  );
}

export { MarkdownText };
