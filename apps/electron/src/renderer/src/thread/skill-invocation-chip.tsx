import * as React from 'react';
import { Sparkles } from 'lucide-react';

import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';
import { MarkdownText } from './markdown-text';
import type { SkillInvocation } from './skill-invocation';

type SkillInvocationChipProps = {
  invocation: SkillInvocation
}

/**
 * 技能调用胶囊：会话真相里 `/skill:name` 已被 hub 展开为全量 SKILL.md，
 * 展示层转义成高亮技能名胶囊（title 悬浮显示 SKILL.md 路径），收起不倾泻正文，
 * 点击展开以 markdown 查看全文；用户附加的指令由消息行另行成泡。
 */
function SkillInvocationChip({ invocation }: SkillInvocationChipProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex max-w-full flex-col items-end gap-[6px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={copy.flow.skillChipLabel(invocation.name)}
        title={invocation.location}
        className="flex max-w-full cursor-pointer items-center gap-[6px] rounded-full border border-border bg-muted py-[4px] pl-[10px] pr-[8px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Sparkles className="size-[13px] shrink-0 text-dot-active" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 truncate text-[12.5px] leading-[20px] font-medium text-dot-active">{invocation.name}</span>
        <ChevronToggle open={open} className="shrink-0 opacity-70" />
      </button>
      {open ? (
        <div className="w-fit max-w-full rounded-[12px] border border-border/70 bg-muted/40 px-[14px] py-[10px] text-left">
          <MarkdownText text={invocation.body} />
        </div>
      ) : null}
    </div>
  );
}

export { SkillInvocationChip };
export type { SkillInvocationChipProps };
