import { CopyButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';

type TurnTimestampRowProps = {
  time: string
  /** 复制入口承载的内容：该轮最终正文 */
  value: string
}

/** 轮次间时间戳行：上一轮结束时刻 + 复制该轮正文的入口。 */
function TurnTimestampRow({ time, value }: TurnTimestampRowProps) {
  return (
    <div className="flex items-center gap-[9px]">
      <CopyButton
        label={copy.flow.copyMessage}
        copiedLabel={copy.flow.copied}
        value={value}
        onCopy={writeClipboardText}
        className="-ml-[3px]"
      />
      <span className="text-[12.5px] leading-[20px] text-muted-foreground">{time}</span>
    </div>
  );
}

export { TurnTimestampRow };
