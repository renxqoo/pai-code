import { BellRing } from 'lucide-react';

import { copy } from '@/strings';

type SystemMessageRowProps = {
  message: { id: string; text: string };
};

/**
 * 系统注入消息行（task-notification / task-message 信封，api.md §7.5）：
 * 以系统提示样式呈现——居中弱化，区别于用户输入气泡。
 */
function SystemMessageRow({ message }: SystemMessageRowProps) {
  return (
    <div className="flex flex-col items-center gap-[6px] rounded-[12px] border border-border/70 bg-muted/40 px-[14px] py-[10px]">
      <div className="flex items-center gap-[6px] text-muted-foreground">
        <BellRing className="size-[13px]" strokeWidth={1.75} />
        <span className="text-[11px] font-medium uppercase tracking-[0.06em]">{copy.flow.systemMessageLabel}</span>
      </div>
      <p className="w-full whitespace-pre-wrap break-words text-center text-[12.5px] leading-[20px] text-foreground/80">
        {message.text}
      </p>
    </div>
  );
}

export { SystemMessageRow };
