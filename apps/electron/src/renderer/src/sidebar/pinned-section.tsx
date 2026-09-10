import * as React from 'react';

import { copy } from '@/strings';
import type { SessionCardModel } from '@/sidebar/session-card-model';
import { SessionRow } from '@/sidebar/session-row';

type PinnedSectionProps = {
  /** 置顶会话（已按最近活跃倒序）。 */
  sessions: readonly SessionCardModel[]
  ages: Readonly<Record<string, string>>
  activeSessionId: string
  onSelect: (sessionId: string) => void
  onClose?: (sessionId: string) => void
  onRename?: (sessionId: string, name: string) => void
  onTogglePin?: (sessionPath: string) => void
  onRetire?: (sessionId: string) => void
}

/** 已置顶区：小标题 + 置顶会话行；分组/项目两视图共用，固定在列表区顶部。 */
function PinnedSection({
  sessions,
  ages,
  activeSessionId,
  onSelect,
  onClose,
  onRename,
  onTogglePin,
  onRetire,
}: PinnedSectionProps) {
  return (
    <section className="flex flex-col gap-[2px] pb-1">
      <div className="px-2 pt-1 pb-[2px] text-[11.5px] leading-none text-muted-foreground">
        {copy.sidebar.pinnedSection}
      </div>
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          age={ages[session.id] ?? ''}
          active={session.id === activeSessionId}
          pinned
          onSelect={onSelect}
          onClose={onClose}
          onRename={onRename}
          onTogglePin={onTogglePin}
          onRetire={onRetire}
        />
      ))}
    </section>
  );
}

const PinnedSectionMemo = React.memo(PinnedSection);
export { PinnedSectionMemo as PinnedSection };
