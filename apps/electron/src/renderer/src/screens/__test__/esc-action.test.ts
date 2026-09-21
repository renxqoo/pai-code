import { describe, expect, test } from 'bun:test';

import { escActionFor, type EscState } from '../esc-action';

function base(overrides: Partial<EscState> = {}): EscState {
  return {
    localDialogOpen: false,
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

describe('escActionFor', () => {
  test('空闲无动作', () => {
    expect(escActionFor(base())).toEqual({ kind: 'none' });
  });

  test('症状回归：`!` 直执行 bash 在途时按 Esc = 中止（actions 稳定化后闭包陈旧曾让 Esc 失效）', () => {
    expect(escActionFor(base({ bashRunning: true }))).toEqual({ kind: 'abort-bash' });
  });


  test('逐层收起优先级：对话框 → 命令面板 → Usage → 新建任务页 → 设置 → 可见侧栏搜索 → 面板 → bash/停止', () => {
    expect(escActionFor(base({ localDialogOpen: true, paletteOpen: true, usageOpen: true }))).toEqual({ kind: 'close-local-dialog' });
    expect(escActionFor(base({ paletteOpen: true, usageOpen: true, settingsOpen: true }))).toEqual({ kind: 'close-palette' });
    expect(escActionFor(base({ localDialogOpen: true, sidebarSearchOpen: true, usageOpen: true, settingsOpen: true }))).toEqual({ kind: 'close-local-dialog' });
    expect(escActionFor(base({ usageOpen: true, newTaskOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-usage' });
    expect(escActionFor(base({ newTaskOpen: true, settingsOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-new-task' });
    expect(escActionFor(base({ settingsOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ sidebarSearchOpen: true, panelOpen: true }))).toEqual({ kind: 'close-sidebar-search' });
    expect(escActionFor(base({ panelOpen: true, bashRunning: true }))).toEqual({ kind: 'close-panel' });
  });

  test('症状回归（T17 测试轮）：全屏覆盖层开着时不先收被遮挡的侧栏搜索（不吞 Esc 一拍）', () => {
    expect(escActionFor(base({ settingsOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ newTaskOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-new-task' });
  });

  test('项目文件面板（T18）：全屏覆盖层之后、侧栏内联层之内优先于搜索收起', () => {
    expect(escActionFor(base({ usageOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-usage' });
    expect(escActionFor(base({ settingsOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ projectFilesOpen: true, newTaskOpen: true }))).toEqual({ kind: 'close-new-task' });
    expect(escActionFor(base({ projectFilesOpen: true, sidebarSearchOpen: true }))).toEqual({ kind: 'close-project-files' });
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
