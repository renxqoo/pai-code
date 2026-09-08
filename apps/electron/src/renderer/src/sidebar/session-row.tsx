import * as React from 'react';
import { LoaderCircle, Pencil, Pin, PinOff, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import { renameCommitValue } from '@/sidebar/rename-commit';
import type { SessionCardModel } from '@/sidebar/session-card-model';

type SessionRowProps = {
  session: SessionCardModel
  /** 相对时间标签（外层按低频 tick 统一计算）。 */
  age: string
  active: boolean
  /** 行首图钉标识：置顶区行置 true。 */
  pinned?: boolean
  /** 项目视图缩进：与会话所在项目文件夹行内容对齐。 */
  indent?: boolean
  onSelect: () => void
  /** 关闭（dispose）会话：hover 显示；文件保留，可从历史恢复。 */
  onClose?: () => void
  /** 行内重命名：提交值 trim 后为空或与原标题相同视为取消。 */
  onRename?: (name: string) => void
  /** 置顶切换：不传则不渲染钉子按钮（未落盘会话无置顶键）。 */
  onTogglePin?: () => void
}

const actionButtonClass =
  'flex size-5 cursor-pointer items-center justify-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

/** 会话行：标题 + 相对时间 + hover 动作（置顶/重命名/关闭）；流式进行中带活动指示。 */
function SessionRow({
  session,
  age,
  active,
  pinned = false,
  indent = false,
  onSelect,
  onClose,
  onRename,
  onTogglePin,
}: SessionRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const commitRename = () => {
    setEditing(false);
    const next = renameCommitValue(draft, session.title);
    if (next !== null) onRename?.(next);
  };

  const canTogglePin = onTogglePin !== undefined;
  const canRename = onRename !== undefined;
  const canClose = onClose !== undefined;
  /** hover 动作与时间标签互斥展示；编辑态只留输入框。 */
  const showActions = (canTogglePin || canRename || canClose) && !editing;

  return (
    <div
      aria-current={active ? 'true' : undefined}
      data-active={active ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group/row flex h-[34px] w-full cursor-pointer items-center rounded-[8px] pr-[6px] text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=false]:hover:bg-accent/60 data-[active=true]:bg-sidebar-accent',
        indent ? 'pl-6' : 'pl-2',
      )}
    >
      {pinned ? (
        <Pin aria-hidden="true" className="mr-2 size-[13px] shrink-0 rotate-45 text-muted-foreground" strokeWidth={1.75} />
      ) : null}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') setEditing(false);
          }}
          onBlur={commitRename}
          className="mr-1 h-[22px] min-w-0 flex-1 cursor-text rounded-[6px] border border-border bg-transparent px-[6px] text-[12px] leading-none text-foreground outline-none select-text focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <span className="min-w-0 truncate text-[12.5px] leading-none font-medium text-foreground">{session.title}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-[2px] pl-2">
        {session.streaming && !editing ? (
          <LoaderCircle
            role="img"
            aria-label={copy.sidebar.working}
            className="size-[13px] shrink-0 animate-spin text-muted-foreground/80"
            strokeWidth={1.75}
          />
        ) : null}
        <span
          className={cn(
            'text-[10.5px] leading-none text-muted-foreground/80',
            showActions && 'group-hover/row:hidden group-focus-within/row:hidden',
          )}
        >
          {age}
        </span>
        {showActions ? (
          <span className="hidden items-center gap-[2px] group-hover/row:flex group-focus-within/row:flex">
            {canTogglePin ? (
              <button
                type="button"
                aria-label={pinned ? copy.sidebar.unpinSession : copy.sidebar.pinSession}
                title={pinned ? copy.sidebar.unpinSession : copy.sidebar.pinSession}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin();
                }}
                className={actionButtonClass}
              >
                {pinned ? (
                  <PinOff className="size-3" strokeWidth={1.75} />
                ) : (
                  <Pin className="size-3 rotate-45" strokeWidth={1.75} />
                )}
              </button>
            ) : null}
            {canRename ? (
              <button
                type="button"
                aria-label={copy.sidebar.renameSession}
                title={copy.sidebar.renameSession}
                onClick={(event) => {
                  event.stopPropagation();
                  setDraft(session.title);
                  setEditing(true);
                }}
                className={actionButtonClass}
              >
                <Pencil className="size-3" strokeWidth={1.75} />
              </button>
            ) : null}
            {canClose ? (
              <button
                type="button"
                aria-label={copy.sidebar.closeSession}
                title={copy.sidebar.closeSession}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                className={actionButtonClass}
              >
                <X className="size-3" strokeWidth={1.75} />
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}

const SessionRowMemo = React.memo(SessionRow);
export { SessionRowMemo as SessionRow };
