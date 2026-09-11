import { readProjectFile } from '@/live/file-actions';
import { bridgeClient, store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { fileTab, openPanel } from '@/panel/panel-state';
import { uiStore } from '@/ui/ui-store';

/**
 * 面板系统控制器（T34 U2）：文件 tab 打开（按 live store 活跃 cwd 寻址）、
 * 「打开文件…」选择弹窗的全量清单拉取（searchFilesIn 装配注入 + 代次守卫——
 * 快速重开丢迟到响应，失败 null 保持空清单降级）、项目文件读取。
 * 多标签开合动作是 ui store 纯 set（panel-state 纯函数包装），不经本控制器。
 */

type SearchFilesIn = (cwd: string, query: string) => Promise<string[] | null>;

let searcher: SearchFilesIn = (cwd, query) => workspaceActions.searchFilesIn(cwd, query);

/** 装配注入 / 测试换装。 */
export function installPanelSearcher(next: SearchFilesIn): void {
  searcher = next;
}

/** 打开文件 tab：路径按当前活跃会话 cwd 寻址（tab 记忆 cwd+path）。 */
export function openFileTab(path: string): void {
  const cwd = activeCwd();
  uiStore.setState((state) => ({ panel: openPanel(state.panel, fileTab(cwd, path)) }));
}

/** 「打开文件…」选择弹窗：进入拉一次全量清单（cmdk 客户端过滤）。 */
let epoch = 0;
export function openFilePicker(): void {
  epoch += 1;
  const current = epoch;
  const ui = uiStore.getState();
  ui.setFilePickerItems([]);
  ui.setFilePickerOpen(true);
  void searcher(activeCwd(), '').then((paths) => {
    if (epoch !== current) return;
    if (paths !== null) uiStore.getState().setFilePickerItems(paths);
  });
}

export function readFile(
  cwd: string,
  path: string,
): Promise<{ ok: true; data: { content: string; truncated: boolean; size: number } } | { ok: false; reason: string }> {
  return readProjectFile(bridgeClient, cwd, path);
}

function activeCwd(): string {
  const state = liveStore.getState();
  const threadId = state.activeThreadId;
  return threadId === null ? '' : (state.sessions[threadId]?.cwd ?? '');
}
