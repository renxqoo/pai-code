import * as React from 'react';
import { Check, GitBranch, GitGraph, Plus, Search } from 'lucide-react';

import type { GitBranchesView } from '@paiapp/contracts';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type BranchPanelProps = {
  /** 分支视图（null = 加载中/失败，按 loading/failed 给空态文案） */
  view: GitBranchesView | null
  loading: boolean
  failed: boolean
  /** 检出在途：行与动作入口禁用 */
  busy: boolean
  onSelect: (branch: string) => void
  /** 打开「创建并检出新分支」弹窗 */
  onCreate: () => void
  /** 打开「Git 图谱」弹窗 */
  onOpenGraph: () => void
};

/** 分支行：图标 + 加粗分支名；当前分支恒亮 + 尾部勾选 + 未提交更改小字。 */
const ROW_CLASS_NAME =
  'flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

/** 底部动作行：图标 + 文案，悬停浮起，与分支行同一内距网格。 */
const ACTION_CLASS_NAME =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

/**
 * 分支面板内容件（锚定面板的纯内容）：搜索过滤 + 分支列表 + 底部动作区。
 * 不含定位/开合逻辑——由通用锚定底座承载；一切数据与回调走 props，不发 IPC。
 * 空态优先级：loading → failed → 过滤无结果。
 */
function BranchPanel({ view, loading, failed, busy, onSelect, onCreate, onOpenGraph }: BranchPanelProps) {
  const [query, setQuery] = React.useState('');
  const keyword = query.trim().toLowerCase();
  const branches = view?.branches ?? [];
  const current = view?.current ?? null;
  const dirtyFiles = view?.dirtyFiles ?? 0;
  const filtered = keyword === '' ? branches : branches.filter((name) => name.toLowerCase().includes(keyword));
  const emptyLabel = loading ? copy.branch.loading : failed ? copy.branch.unavailable : copy.branch.empty;
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-5">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.branch.search}
          aria-label={copy.branch.search}
          autoComplete="off"
          spellCheck={false}
          className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto p-3">
        <div className="px-2 pt-1.5 pb-2 text-[13px] leading-none text-muted-foreground">{copy.branch.panelTitle}</div>
        <div className="flex flex-col gap-0.5">
          {filtered.map((name) => {
            const isCurrent = name === current;
            return (
              <button
                key={name}
                type="button"
                disabled={busy}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => onSelect(name)}
                className={cn(ROW_CLASS_NAME, isCurrent && 'bg-muted hover:bg-muted')}
              >
                <GitBranch aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                  {isCurrent && dirtyFiles > 0 ? (
                    <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                      {copy.branch.dirtyFiles(dirtyFiles)}
                    </span>
                  ) : null}
                </span>
                {isCurrent ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">{emptyLabel}</div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-border p-3">
        <button type="button" disabled={busy} onClick={onCreate} className={ACTION_CLASS_NAME}>
          <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          {copy.branch.createBranch}
        </button>
        <button type="button" disabled={busy} onClick={onOpenGraph} className={ACTION_CLASS_NAME}>
          <GitGraph aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          {copy.branch.openGraph}
        </button>
      </div>
    </>
  );
}

export { BranchPanel };
export type { BranchPanelProps };
