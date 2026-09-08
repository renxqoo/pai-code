import { describe, expect, test } from 'bun:test';

import { escActionFor, type EscState } from '../esc-action';

function base(overrides: Partial<EscState> = {}): EscState {
  return {
    dialogCount: 0,
    sidebarSearchOpen: false,
    usageOpen: false,
    newThreadOpen: false,
    settingsOpen: false,
    panel: null,
    bashRunning: false,
    confirmStop: false,
    generating: false,
    agentsActive: false,
    ...overrides,
  };
}

describe('escActionFor', () => {
  test('空闲无动作', () => {
    expect(escActionFor(base())).toEqual({ kind: 'none' });
  });

  test('症状回归：`!` 直执行 bash 在途时按 Esc = 中止（actions 稳定化后闭包陈旧曾让 Esc 失效）', () => {
    expect(escActionFor(base({ bashRunning: true }))).toEqual({ kind: 'abort-bash' });
  });

  test('逐层收起优先级：对话框 → Usage → 新会话弹窗 → 设置 → 可见侧栏搜索 → 面板 → bash/停止', () => {
    expect(escActionFor(base({ dialogCount: 1, sidebarSearchOpen: true, usageOpen: true, settingsOpen: true }))).toEqual({ kind: 'dismiss-dialogs' });
    expect(escActionFor(base({ usageOpen: true, newThreadOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-usage' });
    expect(escActionFor(base({ newThreadOpen: true, settingsOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-new-thread' });
    expect(escActionFor(base({ settingsOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ sidebarSearchOpen: true, panel: 'diff' }))).toEqual({ kind: 'close-sidebar-search' });
    expect(escActionFor(base({ panel: 'agents', bashRunning: true }))).toEqual({ kind: 'close-panel' });
  });

  test('症状回归（T17 测试轮）：全屏覆盖层开着时不先收被遮挡的侧栏搜索（不吞 Esc 一拍）', () => {
    expect(escActionFor(base({ settingsOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ newThreadOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-new-thread' });
  });

  test('侧栏搜索可见时 Esc 先收搜索，不穿透触发停止/中止', () => {
    expect(escActionFor(base({ sidebarSearchOpen: true, bashRunning: true }))).toEqual({ kind: 'close-sidebar-search' });
    expect(escActionFor(base({ sidebarSearchOpen: true, generating: true }))).toEqual({ kind: 'close-sidebar-search' });
  });

  test('生成中：有在途子代理先确认，否则直接停止；确认条开着则执行停止', () => {
    expect(escActionFor(base({ generating: true, agentsActive: true }))).toEqual({ kind: 'ask-confirm-stop' });
    expect(escActionFor(base({ generating: true }))).toEqual({ kind: 'stop-turn' });
    expect(escActionFor(base({ generating: true, confirmStop: true }))).toEqual({ kind: 'execute-confirmed-stop' });
  });
});
