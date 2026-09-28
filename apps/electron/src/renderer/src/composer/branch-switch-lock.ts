import type { LiveThreadState } from '@/live/live-thread-state';
import { summarizeAgents } from '@/thread/panel-summary';

/** 线程占用判定输入（结构性最小面，纯函数可测）：会话按线程 id 键索引 cwd。 */
export type BranchSwitchSessions = Readonly<Record<string, { cwd: string } | undefined>>;
export type BranchSwitchThreads = Readonly<Record<string, LiveThreadState>>;

/** 单线程是否在跑会动工作树的事（流式回复 / 子 agent / 直执行 bash / 自动重试）。 */
function threadBusy(thread: LiveThreadState): boolean {
  return (
    thread.streaming ||
    summarizeAgents(thread.agents).busyCount > 0 ||
    thread.bashRunning ||
    thread.retrying !== null
  );
}

/** 锁态判定结果：locked + 运行中会话数（锁因文案数据源——「N 个会话运行中」）。 */
export interface BranchSwitchLockState {
  readonly locked: boolean
  /** 锁定时在跑的会话数（未锁恒 0） */
  readonly runningCount: number
}

const UNLOCKED: BranchSwitchLockState = { locked: false, runningCount: 0 };

/**
 * 分支切换锁（T36 引用 T23 裁决）：目标工作目录上任一线程在跑即锁定——
 * 切分支会改写该目录的工作树基线，运行中的 agent 读写会被拆台。
 * 无目录同样不给切换入口。计数化（D6）：锁因可见——静默禁用是人机交互反模式。
 * 「于当前 HEAD 建新分支」（create）不在此锁域——不改工作树不拆台，装配层放行。
 */
export function branchSwitchLockState(sessions: BranchSwitchSessions, threads: BranchSwitchThreads, cwd: string): BranchSwitchLockState {
  if (cwd.length === 0) return { locked: true, runningCount: 0 };
  let runningCount = 0;
  for (const [threadId, thread] of Object.entries(threads)) {
    if (!threadBusy(thread)) continue;
    if (sessions[threadId]?.cwd === cwd) runningCount += 1;
  }
  return runningCount > 0 ? { locked: true, runningCount } : UNLOCKED;
}

/** 布尔兼容面（既有消费方）：切换是否被锁。 */
export function branchSwitchLocked(sessions: BranchSwitchSessions, threads: BranchSwitchThreads, cwd: string): boolean {
  return branchSwitchLockState(sessions, threads, cwd).locked;
}
