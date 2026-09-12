import * as React from 'react';

import { MarkdownChunk } from './markdown-chunk';
import { nextMarkdownStreamCache, type MarkdownStreamCache } from './markdown-stream-cache';
import { useStreamdownPlugins } from './use-streamdown-plugins';

type MarkdownTextProps = {
  text: string
  className?: string
}

/** 分裂形态的块根类：尾块间由容器 space-y 供给间距，块内由 chunk 自身 space-y 供给。 */
const CHUNK_CLASS = 'md-chunk space-y-[14px]';

/**
 * 对话正文：streamdown 渲染（GFM 表格 / KaTeX 公式 / Mermaid 图示 / Shiki 高亮）。
 * 不开启 animated：TextBlock 在切线程与历史轮重渲时组件重挂载，会把全文当新内容
 * 重播进入动画；流式增量本身逐帧可见，无需逐词动画。isAnimating 保持默认 false。
 *
 * 块冻结渲染（T37）：流式 append-only 期间由 markdown-stream-cache 增量切尾——
 * 已完结块（冻结区，内容永不再变）逐片段经 memo 化 chunk 渲染（零重渲），只有
 * 实时尾区每 delta 重渲；脚注文本回退整文单实例（对齐上游快速路径）。单块形态
 * （frozen 为空）保持与既有单实例渲染完全一致。
 */
function MarkdownText({ text, className }: MarkdownTextProps): React.JSX.Element | null {
  const cacheRef = React.useRef<MarkdownStreamCache | null>(null);
  const next = nextMarkdownStreamCache(cacheRef.current, text);
  cacheRef.current = next;
  const plugins = useStreamdownPlugins(next.math, next.mermaid);
  if (text.length === 0) return null;
  const containerClass = `chat-markdown space-y-[14px] text-[14px] leading-[24px] text-foreground ${className ?? ''}`.trim();
  if (next.frozen.length === 0) {
    return <MarkdownChunk text={text} className={containerClass} plugins={plugins} />;
  }
  return (
    <div className={containerClass}>
      {next.frozen.map((chunk, index) => (
        <MarkdownChunk key={`frozen-${index}`} text={chunk} className={CHUNK_CLASS} plugins={plugins} />
      ))}
      <MarkdownChunk key="tail" text={next.tail} className={CHUNK_CLASS} plugins={plugins} />
    </div>
  );
}

export { MarkdownText };
