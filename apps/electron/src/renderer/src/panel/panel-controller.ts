import type { ApiOutcome } from '@paiapp/contracts';

import { readProjectFile } from '@/live/file-actions';
import { bridgeClient, store as liveStore } from '@/live/workspace-runtime';
import { fileTab, openPanel } from '@/panel/panel-state';
import { uiStore } from '@/ui/ui-store';

/**
 * 面板系统控制器（T34 U2）：文件 tab 打开（按 live store 活跃 cwd 寻址）与
 * 项目文件读取。多标签开合动作是 ui store 纯 set（panel-state 纯函数包装），
 * 不经本控制器。
 */

/** 打开文件 tab：路径按当前活跃会话 cwd 寻址（tab 记忆 cwd+path）。 */
export function openFileTab(path: string): void {
  const cwd = activeCwd();
  uiStore.setState((state) => ({ panel: openPanel(state.panel, fileTab(cwd, path)) }));
}

export function readFile(cwd: string, path: string): Promise<ApiOutcome<'file/read'>> {
  return readProjectFile(bridgeClient, cwd, path);
}

function activeCwd(): string {
  const state = liveStore.getState();
  const threadId = state.activeThreadId;
  return threadId === null ? '' : (state.sessions[threadId]?.cwd ?? '');
}
