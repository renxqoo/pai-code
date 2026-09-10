/**
 * Esc 语义的纯裁决（api.md 约定）：对话框开→交由对话框；侧栏搜索展开→先收搜索；
 * 运行状态/设置/Usage/新建任务页/面板依次收起；bash 在途→中止；确认条→执行停止；
 * 生成中→有在途子代理先确认否则直接停止；空闲→无动作。
 * 抽为纯函数使依赖面显式化（任一裁决输入缺订阅都会被用例钉住）。
 */

export type EscAction =
  | { kind: 'none' }
  | { kind: 'dismiss-dialogs' }
  | { kind: 'close-palette' }
  | { kind: 'close-sidebar-search' }
  | { kind: 'close-usage' }
  | { kind: 'close-project-files' }
  | { kind: 'close-new-task' }
  | { kind: 'close-settings' }
  | { kind: 'close-panel' }
  | { kind: 'abort-bash' }
  | { kind: 'stop-turn' }
  | { kind: 'ask-confirm-stop' }
  | { kind: 'execute-confirmed-stop' };

export type EscState = {
  dialogCount: number;
  /** 命令面板开着（⌘P 浮层；模态对话框仍优先于它）。 */
  paletteOpen: boolean;
  /** 侧栏搜索可见且展开（侧栏未收起、无更高层覆盖时由调用方算出）：内联层，覆盖层全部收起后才轮到它。 */
  sidebarSearchOpen: boolean;
  /** 运行状态页（全屏覆盖层，与 Usage 同层）：先于其余覆盖层收起。 */
  usageOpen: boolean;
  /** 项目文件面板（侧栏内嵌层：面板可见〔侧栏未收起〕才参与链，先于侧栏搜索）。 */
  projectFilesOpen: boolean;
  /** 新建任务页（整页）优先于底层动作：Esc 只返回会话视图，不穿透触发停止/清队列。 */
  newTaskOpen: boolean;
  settingsOpen: boolean;
  /** 右侧面板容器有任一 tab（整组收起）。 */
  panelOpen: boolean;
  bashRunning: boolean;
  confirmStop: boolean;
  generating: boolean;
  /** 存在在途子代理时停止不可恢复，需先经确认条。 */
  agentsActive: boolean;
};

export function escActionFor(state: EscState): EscAction {
  if (state.dialogCount > 0) return { kind: 'dismiss-dialogs' };
  if (state.paletteOpen) return { kind: 'close-palette' };
  if (state.usageOpen) return { kind: 'close-usage' };
  if (state.newTaskOpen) return { kind: 'close-new-task' };
  if (state.settingsOpen) return { kind: 'close-settings' };
  // 项目文件面板与侧栏搜索同为侧栏内联层：位于全屏覆盖（Usage/新会话/设置）之下，
  // 只有可见（侧栏未收起）时才参与链；面板替换列表区，先于搜索收起
  if (state.projectFilesOpen) return { kind: 'close-project-files' };
  if (state.sidebarSearchOpen) return { kind: 'close-sidebar-search' };
  if (state.panelOpen) return { kind: 'close-panel' };
  if (state.bashRunning) return { kind: 'abort-bash' };
  if (state.confirmStop) return { kind: 'execute-confirmed-stop' };
  if (!state.generating) return { kind: 'none' };
  return state.agentsActive ? { kind: 'ask-confirm-stop' } : { kind: 'stop-turn' };
}
