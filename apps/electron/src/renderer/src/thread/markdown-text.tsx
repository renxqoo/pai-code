import { Streamdown } from 'streamdown';

import { StreamdownImage } from './streamdown-image';
import { StreamdownLink } from './streamdown-link';
import { streamdownTranslations } from './streamdown-translations';
import { useStreamdownPlugins } from './use-streamdown-plugins';

type MarkdownTextProps = {
  text: string
  className?: string
}

/**
 * 对话正文：streamdown 渲染（GFM 表格 / KaTeX 公式 / Mermaid 图示 / Shiki 高亮）。
 * 不开启 animated：TextBlock 在切线程与历史轮重渲时组件重挂载，会把全文当新内容
 * 重播进入动画；流式增量本身逐帧可见，无需逐词动画。isAnimating 保持默认 false。
 */
function MarkdownText({ text, className }: MarkdownTextProps) {
  const plugins = useStreamdownPlugins(text);
  if (text.length === 0) return null;
  return (
    <Streamdown
      className={`chat-markdown space-y-[12px] text-[14px] leading-[24px] text-foreground ${className ?? ''}`.trim()}
      plugins={plugins}
      components={{ a: StreamdownLink, img: StreamdownImage }}
      translations={streamdownTranslations()}
      /* 正文代码仅供阅读/复制，不出下载入口；表格/图示/图片控件保持 streamdown 默认 */
      controls={{ code: { download: false } }}
      /* 表格滚动上限：约 20 行单行表格再出现区内滚动（streamdown 默认 300px ≈ 6 行） */
      tableMaxHeight={800}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
    >
      {text}
    </Streamdown>
  );
}

export { MarkdownText };
