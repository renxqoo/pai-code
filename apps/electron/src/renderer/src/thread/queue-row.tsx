import { Sparkles, X } from 'lucide-react';

import { parseSkillInvocation } from './skill-invocation';

/** 排队消息单行（纯展示，装饰性引导符 + 文本）。
 * 技能调用的排队文本同样是 hub 展开后的全量块：转义为高亮技能名 + 附加指令摘要。 */
function QueueRow({ text }: { text: string }) {
  const invocation = parseSkillInvocation(text);
  return (
    <div className="flex items-start gap-[6px] rounded-[8px] px-[6px] py-[4px] hover:bg-accent/40">
      <X className="mt-[3px] size-[11px] shrink-0 text-muted-foreground/50" strokeWidth={2} aria-hidden="true" />
      {invocation === null ? (
        <span className="min-w-0 break-words text-[12.5px] leading-[19px] text-foreground/90">{text}</span>
      ) : (
        <span className="flex min-w-0 items-center gap-[5px] text-[12.5px] leading-[19px]">
          <Sparkles className="size-[12px] shrink-0 text-dot-active" strokeWidth={1.75} aria-hidden="true" />
          <span className="shrink-0 font-medium text-dot-active">{invocation.name}</span>
          {invocation.instructions.length > 0 ? (
            <span className="min-w-0 truncate text-foreground/90">{invocation.instructions}</span>
          ) : null}
        </span>
      )}
    </div>
  );
}

export { QueueRow };
