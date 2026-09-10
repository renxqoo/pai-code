import { describe, expect, test } from 'bun:test';

import {
  closeAllPanels,
  closePanelTab,
  EMPTY_PANEL,
  focusPanelTab,
  openPanel,
  panelTabLabel,
  singletonTab,
  togglePanel,
} from '../panel-state';

const DIFF = singletonTab('diff');
const AGENTS = singletonTab('agents');

describe('openPanel', () => {
  test('空态开 diff：入列并激活', () => {
    expect(openPanel(EMPTY_PANEL, DIFF)).toEqual({ tabs: [DIFF], activeId: 'diff' });
  });

  test('同 id 幂等：不重复入列，重开聚焦', () => {
    const state = openPanel(EMPTY_PANEL, DIFF);
    expect(openPanel(state, DIFF)).toEqual({ tabs: [DIFF], activeId: 'diff' });
    const withAgents = openPanel(state, AGENTS);
    expect(openPanel(withAgents, DIFF)).toEqual({ tabs: [DIFF, AGENTS], activeId: 'diff' });
  });
});

describe('closePanelTab', () => {
  test('关活跃取右邻；无右邻取左邻；关最后一个 → null', () => {
    const state = { tabs: [DIFF, AGENTS], activeId: 'diff' };
    expect(closePanelTab(state, 'diff')).toEqual({ tabs: [AGENTS], activeId: 'agents' });
    const right = { tabs: [DIFF, AGENTS], activeId: 'agents' };
    expect(closePanelTab(right, 'agents')).toEqual({ tabs: [DIFF], activeId: 'diff' });
    expect(closePanelTab({ tabs: [DIFF], activeId: 'diff' }, 'diff')).toEqual(EMPTY_PANEL);
  });

  test('关非活跃 tab 不动焦点；未知 id 原样返回', () => {
    const state = { tabs: [DIFF, AGENTS], activeId: 'agents' };
    expect(closePanelTab(state, 'diff')).toEqual({ tabs: [AGENTS], activeId: 'agents' });
    expect(closePanelTab(state, 'nope')).toBe(state);
  });
});

describe('focusPanelTab / togglePanel / closeAllPanels', () => {
  test('聚焦已存在 tab；未知 id 不变', () => {
    const state = openPanel(openPanel(EMPTY_PANEL, DIFF), AGENTS);
    expect(focusPanelTab(state, 'diff').activeId).toBe('diff');
    expect(focusPanelTab(state, 'nope')).toBe(state);
  });

  test('toggle：未开→开并聚焦；开且活跃→关；开但不活跃→聚焦', () => {
    expect(togglePanel(EMPTY_PANEL, 'diff')).toEqual({ tabs: [DIFF], activeId: 'diff' });
    const state = openPanel(EMPTY_PANEL, DIFF);
    expect(togglePanel(state, 'diff')).toEqual(EMPTY_PANEL);
    const withAgents = openPanel(state, AGENTS);
    expect(togglePanel(withAgents, 'diff')).toEqual({ tabs: [DIFF, AGENTS], activeId: 'diff' });
  });

  test('整组收起恒空态', () => {
    expect(closeAllPanels()).toEqual(EMPTY_PANEL);
  });
});

describe('panelTabLabel', () => {
  test('kind → 文案映射', () => {
    const labels = { diff: 'Diff', agents: '子代理' };
    expect(panelTabLabel(DIFF, labels)).toBe('Diff');
    expect(panelTabLabel(AGENTS, labels)).toBe('子代理');
  });
});
