import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';

type CodeBlockProps = {
  lang: string
  code: string
}

/** fenced 代码块卡片：语言标 + 复制入口，内容横向滚动不折行。 */
function CodeBlock({ lang, code }: CodeBlockProps) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface-subtle">
      <div className="flex h-[24px] items-center justify-between border-b border-border px-[10px]">
        <span className="font-mono text-[10.5px] leading-none text-muted-foreground/80">
          {lang.length > 0 ? lang : copy.flow.codeLabel}
        </span>
        <CopyButton label={copy.flow.copyCode} copiedLabel={copy.flow.copied} value={code} onCopy={writeClipboardText} />
      </div>
      <pre className="overflow-x-auto px-[10px] py-[8px] font-mono text-[11.5px] leading-[18px] text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export { CodeBlock };
