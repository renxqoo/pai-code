/**
 * Esc 语义的纯裁决（api.md 约定）：覆盖层按注册表收起（注册序即收起序），
 * 表尾是 bash/停止确认链（在途→中止；确认条→执行停止；生成中→有在途子代理先
 * 确认否则直接停止；空闲→无动作）。抽为纯函数使依赖面显式化（任一裁决输入缺订阅
 * 都会被用例钉住）。注册制：新增覆盖层 = 在 escLayers 加一项；侧栏内嵌层
 * （文件面板）的可见性（侧栏未收起）由调用方折算进对应布尔位。
 */

export type EscAction =
  | { kind: 'none' }
  | { kind: 'close-image-viewer' }
  | { kind: 'close-usage' }
  | { kind: 'close-project-files' }
  | { kind: 'close-new-task' }
  | { kind: 'close-settings' }
  | { kind: 'close-panel' }
  | { kind: 'close-local-dialog' }
  | { kind: 'abort-bash' }
  | { kind: 'stop-turn' }
  | { kind: 'ask-confirm-stop' }
  | { kind: 'execute-confirmed-stop' };

export type EscState = {
  /** 新建任务页内本地浮层开着（浮层自行消费 Esc，不穿透关闭整页）。hub confirm
   *  待答为输入区内联条（非模态），不参与 Esc 链。 */
  localDialogOpen: boolean;
  /** 命令面板（⌘K）开着。正常 Esc 由面板的 Base UI Dialog 自行消费（监听挂在
   *  document 冒泡阶段并 stopPropagation，到不了 window）；本层只兜 IME 合成期
   *  的泄漏——输入法选词时按 Esc 想取消候选框，若穿透到链尾会停掉正在跑的那一轮，
   *  故面板开着时无条件吸收本次 Esc。 */
  commandPanelOpen: boolean;
  /** 用量页（全屏覆盖层，与运行状态同层）：先于其余覆盖层收起。 */
  usageOpen: boolean;
  /** 项目文件面板（侧栏内嵌层：面板可见〔侧栏未收起〕才参与链）。 */
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
  /** 图片预览灯箱（最上层覆盖层）：开着时 Esc 只关灯箱，不穿透底层链。 */
  imageViewerOpen: boolean;
};

export type EscLayer = {
  /** 稳定英文标识（词表封闭性/注册序表驱动用例按 id 钉住）。 */
  readonly id: string;
  readonly isOpen: (state: EscState) => boolean;
  readonly action: EscAction;
};

/** 覆盖层收起注册表：注册序即 Esc 收起序——灯箱（全屏最上层）→ 本地浮层 → 命令面板（兜底层）→ 整页覆盖（用量/新建任务/设置）→ 侧栏内嵌层（文件面板）→ 右侧面板容器。 */
export const escLayers: readonly EscLayer[] = [
  { id: 'image-viewer', isOpen: (state) => state.imageViewerOpen, action: { kind: 'close-image-viewer' } },
  { id: 'local-dialog', isOpen: (state) => state.localDialogOpen, action: { kind: 'close-local-dialog' } },
  { id: 'command-panel', isOpen: (state) => state.commandPanelOpen, action: { kind: 'none' } },
  { id: 'usage', isOpen: (state) => state.usageOpen, action: { kind: 'close-usage' } },
  { id: 'new-task', isOpen: (state) => state.newTaskOpen, action: { kind: 'close-new-task' } },
  { id: 'settings', isOpen: (state) => state.settingsOpen, action: { kind: 'close-settings' } },
  { id: 'project-files', isOpen: (state) => state.projectFilesOpen, action: { kind: 'close-project-files' } },
  { id: 'panel', isOpen: (state) => state.panelOpen, action: { kind: 'close-panel' } },
];

export function escActionFor(state: EscState): EscAction {
  for (const layer of escLayers) {
    if (layer.isOpen(state)) return layer.action;
  }
  if (state.bashRunning) return { kind: 'abort-bash' };
  if (state.confirmStop) return { kind: 'execute-confirmed-stop' };
  if (!state.generating) return { kind: 'none' };
  return state.agentsActive ? { kind: 'ask-confirm-stop' } : { kind: 'stop-turn' };
}
