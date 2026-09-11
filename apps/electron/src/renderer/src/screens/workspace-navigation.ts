import { workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 主区导航出口（单一真相）：任何「打开某个会话」的入口都必须先退出新建任务页——
 * 新建任务页是整页模式，导航过去后若不退出，侧栏点历史对话/设置页打开历史会话都不会有反应。
 * 侧栏行与设置页历史共用同一出口，新增入口一律走这里。
 * 不动右侧面板：面板组态按会话记忆（use-panel-tabs 切换时存档/恢复），
 * 导航侧清面板会把旧会话的存档覆盖成空（T30 对抗审查 高-1）。
 * 无参单例：整页开合在 ui store、会话动作在 workspaceActions，import 即用。
 */

export type NavigationHandlers = {
  onSelectSession: (threadId: string) => void
  onOpenSavedSession: (sessionPath: string) => void
}

export const navigation: NavigationHandlers = {
  onSelectSession: (threadId) => {
    uiStore.getState().closeNewTask();
    workspaceActions.selectSession(threadId);
  },
  onOpenSavedSession: (sessionPath) => {
    uiStore.getState().closeNewTask();
    void workspaceActions.openSavedSession(sessionPath);
    uiStore.getState().closeSettings();
  },
};
