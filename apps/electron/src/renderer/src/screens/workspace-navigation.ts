/**
 * 主区导航出口（纯装配，可单测）：任何「打开某个会话」的入口都必须先退出新建任务页——
 * 新建任务页是整页模式，导航过去后若不退出，侧栏点历史对话/设置页打开历史会话都不会有反应。
 * 侧栏行与设置页历史共用同一出口，新增入口一律走这里。
 * 不动右侧面板：面板组态按会话记忆（use-panel-tabs 切换时存档/恢复），
 * 导航侧清面板会把旧会话的存档覆盖成空（T30 对抗审查 高-1）。
 */

export type NavigationDeps = {
  /** 退出新建任务页（整页模式） */
  closeNewTask: () => void
  selectSession: (threadId: string) => void
  openSavedSession: (sessionPath: string) => void
  /** 设置页历史打开会话后关闭设置页 */
  closeSettings: () => void
}

export type NavigationHandlers = {
  onSelectSession: (threadId: string) => void
  onOpenSavedSession: (sessionPath: string) => void
}

export function createNavigationHandlers(deps: NavigationDeps): NavigationHandlers {
  return {
    onSelectSession: (threadId) => {
      deps.closeNewTask();
      deps.selectSession(threadId);
    },
    onOpenSavedSession: (sessionPath) => {
      deps.closeNewTask();
      deps.openSavedSession(sessionPath);
      deps.closeSettings();
    },
  };
}
