/**
 * 右侧面板多标签状态（纯函数，容器只接线）：
 * 单例 tab（diff/agents，id == kind）与参数化 tab（后续文件视图）共存；
 * 关闭活跃 tab 时焦点移到右邻，无右邻取左邻——与浏览器 tab 惯例一致。
 */

export type PanelKind = 'diff' | 'agents';

export type PanelTab = {
  id: string;
  kind: PanelKind;
};

export type PanelState = {
  tabs: readonly PanelTab[];
  activeId: string | null;
};

export const EMPTY_PANEL: PanelState = { tabs: [], activeId: null };

/** 单例 tab 的稳定 id（同 kind 只存一份）。 */
export function singletonTab(kind: PanelKind): PanelTab {
  return { id: kind, kind };
}

export function openPanel(state: PanelState, tab: PanelTab): PanelState {
  const exists = state.tabs.some((entry) => entry.id === tab.id);
  return {
    tabs: exists ? state.tabs : [...state.tabs, tab],
    activeId: tab.id,
  };
}

export function closePanelTab(state: PanelState, id: string): PanelState {
  const index = state.tabs.findIndex((entry) => entry.id === id);
  if (index === -1) return state;
  const tabs = state.tabs.filter((entry) => entry.id !== id);
  // 焦点迁移：关活跃取右邻，无右邻取左邻；关非活跃不动焦点
  let activeId = state.activeId;
  if (state.activeId === id) {
    activeId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
  }
  return { tabs, activeId };
}

export function focusPanelTab(state: PanelState, id: string): PanelState {
  return state.tabs.some((entry) => entry.id === id) ? { ...state, activeId: id } : state;
}

/** 快捷键 toggle 语义：已开且是活跃 tab → 关闭；否则打开并聚焦。 */
export function togglePanel(state: PanelState, kind: PanelKind): PanelState {
  if (state.activeId === kind) return closePanelTab(state, kind);
  return openPanel(state, singletonTab(kind));
}

/** Esc / 面板级关闭：整组收起（多 tab 下一次 Esc 全收，与既有单槽语义一致）。 */
export function closeAllPanels(): PanelState {
  return EMPTY_PANEL;
}

export type PanelTabLabels = {
  diff: string;
  agents: string;
};

/** tab → 标签文案（视图菜单与标签行共用同一词表）。 */
export function panelTabLabel(tab: PanelTab, labels: PanelTabLabels): string {
  return tab.kind === 'diff' ? labels.diff : labels.agents;
}
