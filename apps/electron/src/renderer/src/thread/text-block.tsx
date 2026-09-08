import * as React from 'react';

import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import { MarkdownText } from './markdown-text';

type TextBlockProps = {
  id: string
  text: string
  className?: string
}

/** 助理正文块：受限 Markdown 渲染（段落/代码块/列表/行内标记），hover 右上角浮出复制入口。 */
function TextBlock({ id, text, className }: TextBlockProps) {
  return (
    <div className="group relative">
      <MarkdownText id={id} text={text} className={className} />
      <CopyButton
        label={copy.flow.copyMessage}
        copiedLabel={copy.flow.copied}
        value={text}
        onCopy={writeClipboardText}
        className="absolute top-0 -right-7 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      />
    </div>
  );
}

const TextBlockMemo = React.memo(TextBlock);
export { TextBlockMemo as TextBlock };
