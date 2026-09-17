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

/**
 * 分支切换锁（T36 引用 T23 裁决）：目标工作目录上任一线程在跑即锁定——
 * 切分支会改写该目录的工作树基线，运行中的 agent 读写会被拆台。
 * 锁定由装配层消费（线程页分支段退回只读），无目录同样不给切换入口。
 */
export function branchSwitchLocked(sessions: BranchSwitchSessions, threads: BranchSwitchThreads, cwd: string): boolean {
  if (cwd.length === 0) return true;
  for (const [threadId, thread] of Object.entries(threads)) {
    if (!threadBusy(thread)) continue;
    if (sessions[threadId]?.cwd === cwd) return true;
  }
  return false;
}
