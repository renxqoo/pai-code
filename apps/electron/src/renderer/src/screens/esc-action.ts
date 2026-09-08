/**
 * Esc 语义的纯裁决（api.md 约定）：对话框开→交由对话框；侧栏搜索展开→先收搜索；
 * 设置/Usage/新会话弹窗/面板依次收起；bash 在途→中止；确认条→执行停止；
 * 生成中→有在途子代理先确认否则直接停止；空闲→无动作。
 * 抽为纯函数使依赖面显式化（任一裁决输入缺订阅都会被用例钉住）。
 */

export type SidePanel = 'diff' | 'agents' | null;

export type EscAction =
  | { kind: 'none' }
  | { kind: 'dismiss-dialogs' }
  | { kind: 'close-sidebar-search' }
  | { kind: 'close-usage' }
  | { kind: 'close-new-thread' }
  | { kind: 'close-settings' }
  | { kind: 'close-panel' }
  | { kind: 'abort-bash' }
  | { kind: 'stop-turn' }
  | { kind: 'ask-confirm-stop' }
  | { kind: 'execute-confirmed-stop' };

export type EscState = {
  dialogCount: number;
  /** 侧栏搜索可见且展开（侧栏未收起、无更高层覆盖时由调用方算出）：内联层，覆盖层全部收起后才轮到它。 */
  sidebarSearchOpen: boolean;
  usageOpen: boolean;
  /** 新会话弹窗优先于底层动作：Esc 只关弹窗，不穿透触发停止/清队列。 */
  newThreadOpen: boolean;
  settingsOpen: boolean;
  panel: SidePanel;
  bashRunning: boolean;
  confirmStop: boolean;
  generating: boolean;
  /** 存在在途子代理时停止不可恢复，需先经确认条。 */
  agentsActive: boolean;
};

export function escActionFor(state: EscState): EscAction {
  if (state.dialogCount > 0) return { kind: 'dismiss-dialogs' };
  if (state.usageOpen) return { kind: 'close-usage' };
  if (state.newThreadOpen) return { kind: 'close-new-thread' };
  if (state.settingsOpen) return { kind: 'close-settings' };
  // 侧栏搜索是内联层：位于全屏覆盖（Usage/新会话/设置）之下，且只有可见时才参与链
  // （不可见搜索不得吞掉一拍 Esc；调用方传「可见搜索」语义）
  if (state.sidebarSearchOpen) return { kind: 'close-sidebar-search' };
  if (state.panel !== null) return { kind: 'close-panel' };
  if (state.bashRunning) return { kind: 'abort-bash' };
  if (state.confirmStop) return { kind: 'execute-confirmed-stop' };
  if (!state.generating) return { kind: 'none' };
  return state.agentsActive ? { kind: 'ask-confirm-stop' } : { kind: 'stop-turn' };
}
