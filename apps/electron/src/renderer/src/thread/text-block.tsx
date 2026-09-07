import { MarkdownText } from './markdown-text';

type TextBlockProps = {
  id: string
  text: string
  className?: string
}

/** 助理正文块：受限 Markdown 渲染（段落/代码块/列表/行内标记）。 */
function TextBlock({ id, text, className }: TextBlockProps) {
  return <MarkdownText id={id} text={text} className={className} />;
}

export { TextBlock };
