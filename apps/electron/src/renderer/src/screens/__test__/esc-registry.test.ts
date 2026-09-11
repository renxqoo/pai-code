import { describe, expect, test } from 'bun:test';

import { escActionFor, escLayers, type EscState } from '../esc-action';

/**
 * Esc 注册表词表封闭性与注册序（T32 U4）：每个覆盖层恰产出一个 close-* 动作、
 * 动作词表与层一一对应、注册序即收起序——新增覆盖层若漏注册或错序，表驱动立即红。
 */

function base(overrides: Partial<EscState> = {}): EscState {
  return {
    dialogCount: 0,
    paletteOpen: false,
    sidebarSearchOpen: false,
    usageOpen: false,
    projectFilesOpen: false,
    newTaskOpen: false,
    settingsOpen: false,
    panelOpen: false,
    bashRunning: false,
    confirmStop: false,
    generating: false,
    agentsActive: false,
    ...overrides,
  };
}

/** 各层 isOpen 对应的 EscState 开关位（表驱动种子）。 */
const layerSwitches: Readonly<Record<string, Partial<EscState>>> = {
  dialogs: { dialogCount: 1 },
  palette: { paletteOpen: true },
  usage: { usageOpen: true },
  'new-task': { newTaskOpen: true },
  settings: { settingsOpen: true },
  'project-files': { projectFilesOpen: true },
  'sidebar-search': { sidebarSearchOpen: true },
  panel: { panelOpen: true },
};

describe('escLayers 注册表', () => {
  test('词表封闭性：每个覆盖层产出唯一的收起动作，close-* 词表与层一一对应', () => {
    const kinds = escLayers.map((layer) => layer.action.kind);
    expect(new Set(kinds).size).toBe(escLayers.length); // 无重复
    expect(kinds).toEqual([
      'dismiss-dialogs',
      'close-palette',
      'close-usage',
      'close-new-task',
      'close-settings',
      'close-project-files',
      'close-sidebar-search',
      'close-panel',
    ]);
    // 每层开关位可被其 isOpen 感知（层定义与种子表失配即红）
    for (const layer of escLayers) {
      expect(layer.isOpen(base(layerSwitches[layer.id] ?? {}))).toBe(true);
      expect(layer.isOpen(base())).toBe(false);
    }
  });

  test('注册序即收起序：第 i 层赢过其后所有层（更高层已收起时逐层接管）', () => {
    for (let i = 0; i < escLayers.length; i += 1) {
      const state = base();
      for (let j = i; j < escLayers.length; j += 1) {
        Object.assign(state, layerSwitches[escLayers[j].id]);
      }
      expect(escActionFor(state)).toEqual(escLayers[i].action);
    }
    expect(escActionFor(base())).toEqual({ kind: 'none' });
  });

  test('表尾规则不受注册表影响：bash 在途 / 确认条 / 生成中确认链 / 空闲与仅子代理在场均无动作', () => {
    expect(escActionFor(base({ bashRunning: true }))).toEqual({ kind: 'abort-bash' });
    expect(escActionFor(base({ confirmStop: true }))).toEqual({ kind: 'execute-confirmed-stop' });
    expect(escActionFor(base({ generating: true }))).toEqual({ kind: 'stop-turn' });
    expect(escActionFor(base({ generating: true, agentsActive: true }))).toEqual({ kind: 'ask-confirm-stop' });
    // 仅在途子代理（非生成中）不触发任何 Esc 动作——agentsActive 不许混入任何层的 isOpen
    expect(escActionFor(base({ agentsActive: true }))).toEqual({ kind: 'none' });
    // 覆盖层仍优先于表尾（面板开着时 bash 不中止）
    expect(escActionFor(base({ panelOpen: true, bashRunning: true }))).toEqual({ kind: 'close-panel' });
  });
});
