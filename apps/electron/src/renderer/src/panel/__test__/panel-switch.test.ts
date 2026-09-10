import { describe, expect, test } from 'bun:test';

import { EMPTY_PANEL, fileTab, openPanel, panelSwitchOutcome, singletonTab, type PanelState } from '../panel-state';

/**
 * 面板会话记忆的切换裁决：导航链不得在切换前清面板（那是把存档覆盖成空的
 * 竞态窗口——T30 对抗审查 高-1 的回归钉）。
 */
describe('panelSwitchOutcome', () => {
  test('同线程：只存档返回 null（不触发 setState）', () => {
    const archive: Record<string, PanelState> = {};
    const panel = openPanel(EMPTY_PANEL, singletonTab('diff'));
    expect(panelSwitchOutcome(archive, 't1', 't1', panel)).toBeNull();
    expect(archive.t1).toEqual(panel);
  });

  test('切线程：存档旧组态 + 返回新线程恢复值（无存档时空态）', () => {
    const archive: Record<string, PanelState> = {};
    const diffPanel = openPanel(EMPTY_PANEL, singletonTab('diff'));
    const filePanel = openPanel(EMPTY_PANEL, fileTab('/w', 'a.ts'));
    archive.t2 = filePanel;
    // t1 → t2：t1 的 diff 组态被存档，返回 t2 的文件面板
    expect(panelSwitchOutcome(archive, 't1', 't2', diffPanel)).toEqual(filePanel);
    expect(archive.t1).toEqual(diffPanel);
    // t2 → t3：t3 无存档 → 空态
    expect(panelSwitchOutcome(archive, 't2', 't3', filePanel)).toEqual(EMPTY_PANEL);
    expect(archive.t2).toEqual(filePanel);
  });
});
