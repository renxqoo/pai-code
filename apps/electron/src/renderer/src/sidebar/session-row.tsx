import * as React from 'react';
import { Archive, LoaderCircle, Pencil, Pin, PinOff, X } from 'lucide-react';

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
  /** 选中会话（平铺回调：引用稳定，行级 memo 不被内联闭包击穿）。 */
  onSelect: (sessionId: string) => void
  /** 关闭（dispose）会话：hover 显示；文件保留，可从历史恢复。 */
  onClose?: (sessionId: string) => void
  /** 行内重命名：提交值 trim 后为空或与原标题相同视为取消。 */
  onRename?: (sessionId: string, name: string) => void
  /** 置顶切换：sessionPath 为 null（未落盘）的行不渲染钉子按钮。 */
  onTogglePin?: (sessionPath: string) => void
  /** 回收 worker（仅 live 且非流式的行出现）；会话保留，可随时唤醒。 */
  onRetire?: (sessionId: string) => void
}

const actionButtonClass =
  'flex size-5 cursor-pointer items-center justify-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

/** 会话行：行首状态位（置顶钉 / 流式活动指示）+ 标题 + 相对时间 + hover 动作（置顶/重命名/关闭）。 */
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
  onRetire,
}: SessionRowProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const commitRename = () => {
    setEditing(false);
    const next = renameCommitValue(draft, session.title);
    if (next !== null) onRename?.(session.id, next);
  };

  const canTogglePin = onTogglePin !== undefined && session.sessionPath !== null;
  const canRename = onRename !== undefined;
  const canClose = onClose !== undefined;
  const canRetire = onRetire !== undefined && session.state === 'live' && !session.streaming;
  /** hover 动作与时间标签同格交叉淡切（不在流内增删，行高与标题截断点恒定）；编辑态只留输入框。 */
  const showActions = (canTogglePin || canRename || canClose || canRetire) && !editing;

  return (
    <div
      aria-current={active ? 'true' : undefined}
      data-active={active ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(session.id);
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
      {session.streaming && !editing ? (
        <LoaderCircle
          role="img"
          aria-label={copy.sidebar.working}
          className="mr-2 size-[13px] shrink-0 animate-spin text-muted-foreground/80"
          strokeWidth={1.75}
        />
      ) : null}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            // 只拦本意按键（Enter 提交 / Esc 取消）不外溢全局 Esc 链；其余放行，⌘N/⌘K 等组合键不失效
            if (event.key === 'Escape') {
              event.stopPropagation();
              setEditing(false);
            } else if (event.key === 'Enter') {
              event.stopPropagation();
              commitRename();
            }
          }}
          onBlur={commitRename}
          className="mr-1 h-[22px] min-w-0 flex-1 cursor-text rounded-[6px] border border-border bg-transparent px-[6px] text-[12px] leading-none text-foreground outline-none select-text focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <span className="min-w-0 truncate text-[12.5px] leading-none font-medium text-foreground">{session.title}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-[2px] pl-2">
        {/* 时间标签与动作钮占同一网格格：格宽按较大者常驻保留，hover 只切换透明度/可见性，行内布局零位移 */}
        <span className="grid items-center justify-items-end">
          <span
            className={cn(
              // 淡出态 opacity<1 创建层叠上下文，会把纯文本标签抬到动作钮之上参与命中测试、
              // 吃掉最右按钮（关闭）的点击——纯展示标签必须永久退出命中（pointer-events-none）
              'pointer-events-none col-start-1 row-start-1 text-[10.5px] leading-none text-muted-foreground/80 transition-opacity duration-150 motion-reduce:transition-none',
              showActions && 'group-hover/row:opacity-0 group-focus-within/row:opacity-0',
            )}
          >
            {age}
          </span>
          {showActions ? (
            <span className="col-start-1 row-start-1 flex items-center gap-[2px] opacity-0 invisible transition-opacity duration-150 motion-reduce:transition-none group-hover/row:visible group-hover/row:opacity-100 group-focus-within/row:visible group-focus-within/row:opacity-100">
              {canTogglePin ? (
                <button
                  type="button"
                  aria-label={pinned ? copy.sidebar.unpinSession : copy.sidebar.pinSession}
                  title={pinned ? copy.sidebar.unpinSession : copy.sidebar.pinSession}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (session.sessionPath !== null) onTogglePin?.(session.sessionPath);
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
              {canRetire ? (
                <button
                  type="button"
                  aria-label={copy.sidebar.retireSession}
                  title={copy.sidebar.retireSession}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetire?.(session.id);
                  }}
                  className={actionButtonClass}
                >
                  <Archive className="size-3" strokeWidth={1.75} />
                </button>
              ) : null}
              {canClose ? (
                <button
                  type="button"
                  aria-label={copy.sidebar.closeSession}
                  title={copy.sidebar.closeSession}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose?.(session.id);
                  }}
                  className={actionButtonClass}
                >
                  <X className="size-3" strokeWidth={1.75} />
                </button>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>
    </div>
  );
}

const SessionRowMemo = React.memo(SessionRow);
export { SessionRowMemo as SessionRow };
