import * as React from 'react';

import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import { MarkdownText } from './markdown-text';

type TextBlockProps = {
  text: string
  className?: string
}

/** 助理正文块：markdown 渲染，hover 右上角浮出复制原文入口（复制 text 原文，不经渲染器）。 */
function TextBlock({ text, className }: TextBlockProps) {
  return (
    <div className="group relative">
      <MarkdownText text={text} className={className} />
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
