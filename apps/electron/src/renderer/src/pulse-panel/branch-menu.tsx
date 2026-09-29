import * as React from 'react';
import { ChevronDown, GitBranch } from 'lucide-react';

import type { GitBranchesView } from '@paiapp/contracts';

import { AnchoredPanel } from '@paiapp/ui';
import { BranchPanel } from '@/composer/branch-panel';
import { CreateBranchDialog } from '@/composer/create-branch-dialog';
import { switchBlockedReason } from '@/composer/branch-switch-guard';
import { copyOfError } from '@/lib/error-text';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { copy } from '@/strings';

type BranchMenuProps = {
  /** 分支视图（null = 加载中/失败，空态文案由 BranchPanel 承担） */
  view: GitBranchesView | null
  /** 当前分支兜底（git/status 的 current——分支列表未到时行文本不缺位） */
  current: string | null
  loading: boolean
  failed: boolean
  cwd: string
  /** 切换锁计数形态（D6：触发器不再静默禁用——面板内锁因行呈现；null=未锁） */
  lock: { runningCount: number } | null
  /** 打开「Git 图谱」弹窗（入口在 Git 分区） */
  onOpenGraph: () => void
};

/**
 * 分支行下拉（速览面板）：AnchoredPanel + BranchPanel 复用线程页分支面板交互
 * （切换守卫 / 创建分支弹窗 / 图谱入口），检出成功 bump 分支失效代次。
 */
function BranchMenu({ view, current: currentFallback, loading, failed, cwd, lock, onOpenGraph }: BranchMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** 同步闸：双击/连点时 state 闭包仍是旧值，异步在途必须用 ref 拦 */
  const busyRef = React.useRef(false);
  const current = view?.current ?? currentFallback;

  const switchBranch = (branchName: string): void => {
    if (busyRef.current) return;
    // 点击时检查（行不禁用）：锁定 → 反馈原因；脏区交 verb 恒重评
    const blocked = switchBlockedReason(lock !== null, lock?.runningCount ?? 0);
    if (blocked !== null) {
      liveStore.getState().pushNotice(blocked);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setOpen(false);
    void workspaceActions.checkoutGitBranch(cwd, branchName, false).then(
      (outcome) => {
        busyRef.current = false;
        setBusy(false);
        if (!outcome.ok) {
          liveStore.getState().pushNotice(copyOfError(outcome.error));
          return;
        }
        uiStore.getState().bumpBranchRevision();
      },
      () => {
        busyRef.current = false;
        setBusy(false);
      },
    );
  };

  const createBranch = (branchName: string): void => {
    if (busyRef.current) return; // 创建不受锁（D6 三出路：create 不改工作树）
    busyRef.current = true;
    setBusy(true);
    setError(null);
    void workspaceActions.checkoutGitBranch(cwd, branchName, true).then(
      (outcome) => {
        busyRef.current = false;
        setBusy(false);
        if (!outcome.ok) {
          setError(copyOfError(outcome.error));
          return;
        }
        setCreateOpen(false);
        uiStore.getState().bumpBranchRevision();
      },
      () => {
        busyRef.current = false;
        setBusy(false);
      },
    );
  };

  return (
    <>
      <AnchoredPanel
        open={open}
        onOpenChange={setOpen}
        label={copy.pulse.git.branchAria(current ?? '')}
        width={280}
        side="bottom"
        align="end"
        trigger={
          <button
            type="button"
            aria-label={copy.pulse.git.branchAria(current ?? '')}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left outline-none select-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{current ?? copy.pulse.git.noBranch}</span>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          </button>
        }
      >
        <BranchPanel
          view={view}
          loading={loading}
          failed={failed}
          busy={busy}
          onSelect={switchBranch}
          lock={lock}
          onCreate={() => {
            setError(null);
            setOpen(false);
            setCreateOpen(true);
          }}
          onOpenGraph={() => {
            setOpen(false);
            onOpenGraph();
          }}
        />
      </AnchoredPanel>
      <CreateBranchDialog
        open={createOpen}
        onOpenChange={(next) => setCreateOpen(next)}
        busy={busy}
        error={error}
        onSubmit={createBranch}
      />
    </>
  );
}

export { BranchMenu };
export type { BranchMenuProps };
