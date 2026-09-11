import { summarizeAgents } from '@/thread/panel-summary';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 停止/中止三态（T33：自 workspace-main 同构迁入，按钮路径）：bash 在途→中止；
 * 有在途子代理且生成中→先确认（不可恢复）；否则直接停止。
 * 输入读 store 真相——与 Esc 链表尾（use-esc-dismiss 的渲染帧输入）同语义不同输入域：
 * 按钮触发在用户交互帧，真相已结算即按真相执行；瞬时分叉是有意取舍。
 */
export function stopOrAbort(): void {
  const state = liveStore.getState();
  const threadId = state.activeThreadId;
  const thread = threadId === null ? undefined : state.threads[threadId];
  const generating = thread?.streaming ?? false;
  const bashRunning = thread?.bashRunning ?? false;
  const agentsActive = summarizeAgents(thread?.agents ?? []).workingCount > 0;
  if (bashRunning) {
    workspaceActions.abortBash();
    return;
  }
  if (agentsActive && generating) {
    uiStore.getState().setConfirmStop(true);
    return;
  }
  workspaceActions.stopActiveTurn();
}
