import * as React from 'react';
import { Folder, X } from 'lucide-react';

import { SparkMark } from '@paiapp/ui';

import { copy } from '@/strings';
import type { SessionCardModel } from '@/sidebar/session-card-model';

type SessionCardProps = {
  session: SessionCardModel
  age: string
  active: boolean
  onSelect: () => void
  /** 关闭（dispose）会话：hover 显示；文件保留，可从历史恢复。 */
  onClose?: () => void
}

/** 会话卡片：项目行（含相对时间）+ 会话标题 + 版本/工作中标记 + 关闭入口。 */
function SessionCard({ session, age, active, onSelect, onClose }: SessionCardProps) {
  return (
    <div
      aria-current={active ? 'true' : undefined}
      data-active={active ? 'true' : 'false'}
      className="group/card relative flex h-[70px] w-full cursor-pointer flex-col justify-between rounded-[10px] px-[9px] py-[9px] text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=false]:hover:bg-accent data-[active=true]:bg-card"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="flex items-center gap-2">
        <Folder className="size-[12px] shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
        <span className="truncate text-[11.5px] leading-none text-muted-foreground">{session.projectName}</span>
        <span className="ml-auto shrink-0 text-[10.5px] leading-none text-muted-foreground/80">{age}</span>
      </span>
      <span className="block truncate text-[12.5px] leading-none font-medium text-foreground">{session.title}</span>
      <span className="flex items-center gap-2">
        <span className="truncate text-[10.5px] leading-none text-muted-foreground/80">{session.version}</span>
        <SparkMark size={12} className="ml-auto text-spark/80" />
      </span>
      {onClose !== undefined ? (
        <button
          type="button"
          aria-label={copy.sidebar.closeSession}
          title={copy.sidebar.closeSession}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="absolute top-[6px] right-[6px] hidden rounded-[6px] p-[3px] text-muted-foreground hover:bg-accent hover:text-foreground group-hover/card:block"
        >
          <X className="size-[12px]" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

const SessionCardMemo = React.memo(SessionCard);
export { SessionCardMemo as SessionCard };
