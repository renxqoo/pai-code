import * as React from 'react';
import { useStore } from 'zustand';
import { Minimize2 } from 'lucide-react';

import type { TodoSnapshotTask } from '@paiapp/contracts';

import { FloatingPanel, IconButton } from '@paiapp/ui';
import { branchSwitchLocked } from '@/composer/branch-switch-lock';
import { useGitBranches } from '@/hooks/use-git-branches';
import { useGitStatus } from '@/hooks/use-git-status';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import type { SubagentModel } from '@/thread/thread-model';
import { useElapsedNow } from '@/thread/use-elapsed-now';
import { uiStore, type PulseSection } from '@/ui/ui-store';
import { copy } from '@/strings';

import { GitSection } from './git-section';
import { pulseChipSegmentsOf, runningAgentsOf } from './pulse-assembly';
import { AgentsSection } from './agents-section';
import { PulseChip } from './pulse-chip';
import { RunningBar } from './running-bar';
import { RunningChip } from './running-chip';
import { TodoSection } from './todo-section';

const EMPTY_TASKS: readonly TodoSnapshotTask[] = [];
const EMPTY_AGENTS: readonly SubagentModel[] = [];

/**
 * 速览面板（T44，0 props）：会话舞台右上角固定浮层——Git 区 / 进程区 / 智能体区
 * + 底部运行条；收起为聚合 chip（+ 运行态浮动胶囊）。数据全部自订阅
 * live/ui store + git 读口（展开即重取，轮结算/checkout 递增失效代次）。
 */
function PulsePanel(): React.JSX.Element | null {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  const activeSession = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.sessions[s.activeThreadId]));
  /** 细粒度订阅（非整表 thread）：流式增量不重渲面板（与 ThreadStage 的 B-batch 预算同规） */
  const todo = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]?.todo)) ?? null;
  const agents = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]?.agents)) ?? EMPTY_AGENTS;
  const turnsSettled = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]?.turnsSettled)) ?? 0;
  const pulse = useStore(uiStore, (s) => s.pulse);
  const branchRevision = useStore(uiStore, (s) => s.branchRevision);

  const activeCwd = activeSession?.cwd ?? '';
  const branchLocked = useStore(liveStore, (s) => branchSwitchLocked(s.sessions, s.threads, activeCwd));

  const tasks = todo?.tasks ?? EMPTY_TASKS;
  const running = runningAgentsOf(agents);
  /** 计时只随运行中子代理走表（无运行中零定时器） */
  const now = useElapsedNow(running.length > 0);

  /** git 失效代次：checkout 成功 + 轮结算（文件改动落点）各递增一次 */
  const gitRevision = React.useMemo(() => branchRevision + turnsSettled, [branchRevision, turnsSettled]);
  const git = useGitStatus(activeCwd, workspaceActions.listGitStatus, gitRevision);
  const branches = useGitBranches(activeCwd, workspaceActions.listGitBranches, branchRevision);

  /** 展开即重取：脏计数随工作区实时变化，缓存快照会过期（零轮询） */
  React.useEffect(() => {
    if (pulse.open) git.refresh();
  }, [pulse.open, git.refresh]);

  if (activeThreadId === '') return null;

  const segments = pulseChipSegmentsOf({
    isRepo: git.view?.isRepo ?? false,
    additions: git.view?.additions ?? 0,
    deletions: git.view?.deletions ?? 0,
    fileCount: git.view?.fileCount ?? 0,
    tasks,
    agents,
  });
  const openAgentsPane = (): void => uiStore.getState().openAgentsPane();
  const toggleSection = (key: PulseSection): (() => void) => () => uiStore.getState().togglePulseSection(key);

  return (
    <div className="pointer-events-none absolute top-[54px] right-3 z-30 flex flex-col items-end gap-2">
      {pulse.open ? (
        <div className="pointer-events-auto w-80">
          <FloatingPanel
            label={copy.pulse.aria}
            title={copy.pulse.title}
            className="max-h-[60vh]"
            actions={
              <IconButton label={copy.pulse.collapse} size="sm" onClick={() => uiStore.getState().setPulseOpen(false)}>
                <Minimize2 strokeWidth={1.75} />
              </IconButton>
            }
            footer={running.length > 0 ? <RunningBar running={running} now={now} onOpen={openAgentsPane} /> : undefined}
          >
            <div className="flex flex-col gap-0.5 px-2 py-2">
              <GitSection
                status={git.view}
                loading={git.loading}
                failed={git.failed}
                onRetry={git.refresh}
                cwd={activeCwd}
                branches={branches.view}
                branchesLoading={branches.loading}
                branchesFailed={branches.failed}
                branchLocked={branchLocked}
                branchRevision={branchRevision}
                onOpenDiff={() => uiStore.getState().openDiffPane()}
              />
              <TodoSection tasks={tasks} open={pulse.sections.todo} onOpenChange={toggleSection('todo')} />
              <AgentsSection agents={agents} now={now} open={pulse.sections.agents} onOpenChange={toggleSection('agents')} onSelect={openAgentsPane} />
            </div>
          </FloatingPanel>
        </div>
      ) : (
        <>
          <PulseChip segments={segments} onExpand={() => uiStore.getState().setPulseOpen(true)} />
          <RunningChip running={running} now={now} onOpen={openAgentsPane} />
        </>
      )}
    </div>
  );
}

export { PulsePanel };
