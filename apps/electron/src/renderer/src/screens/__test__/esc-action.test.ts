import { describe, expect, test } from 'bun:test';

import { escActionFor, type EscState } from '../esc-action';

function base(overrides: Partial<EscState> = {}): EscState {
  return {
    localDialogOpen: false,
    commandPanelOpen: false,
    usageOpen: false,
    projectFilesOpen: false,
    newTaskOpen: false,
    settingsOpen: false,
    panelOpen: false,
    bashRunning: false,
    confirmStop: false,
    generating: false,
    agentsActive: false,
    imageViewerOpen: false,
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

  test('逐层收起优先级：灯箱 → 对话框 → 命令面板兜底 → Usage → 新建任务页 → 设置 → 项目文件面板 → 面板 → bash/停止', () => {
    expect(escActionFor(base({ imageViewerOpen: true, localDialogOpen: true }))).toEqual({ kind: 'close-image-viewer' });
    expect(escActionFor(base({ localDialogOpen: true, commandPanelOpen: true, usageOpen: true }))).toEqual({ kind: 'close-local-dialog' });
    expect(escActionFor(base({ usageOpen: true, newTaskOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-usage' });
    expect(escActionFor(base({ newTaskOpen: true, settingsOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-new-task' });
    expect(escActionFor(base({ settingsOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ projectFilesOpen: true, panelOpen: true }))).toEqual({ kind: 'close-project-files' });
    expect(escActionFor(base({ panelOpen: true, bashRunning: true }))).toEqual({ kind: 'close-panel' });
  });

  test('灯箱最上层：开着时 Esc 只关灯箱，不穿透底层任何覆盖层/停止链（症状回归：底层面板被连带收走）', () => {
    expect(escActionFor(base({ imageViewerOpen: true, panelOpen: true, bashRunning: true }))).toEqual({ kind: 'close-image-viewer' });
    expect(escActionFor(base({ imageViewerOpen: true, generating: true, confirmStop: true }))).toEqual({ kind: 'close-image-viewer' });
  });

  test('全屏覆盖层开着时不先收被遮挡的侧栏内嵌层（不吞 Esc 一拍）', () => {
    expect(escActionFor(base({ settingsOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-settings' });
    expect(escActionFor(base({ newTaskOpen: true, projectFilesOpen: true }))).toEqual({ kind: 'close-new-task' });
  });

  test('命令面板兜底层：面板开着时无条件吸收 Esc', () => {
    // Base UI Dialog 正常路径已自行消费 Esc 并 stopPropagation，走不到这里；
    // 兜底层专为 IME 合成期（选词按 Esc 想取消候选框时 useDismiss 提前 return、
    // 事件穿透到 window）而设——面板开着时这一拍绝不能落到停止/中止链。
    expect(escActionFor(base({ commandPanelOpen: true }))).toEqual({ kind: 'none' });
    expect(escActionFor(base({ commandPanelOpen: true, bashRunning: true }))).toEqual({ kind: 'none' });
    expect(escActionFor(base({ commandPanelOpen: true, generating: true }))).toEqual({ kind: 'none' });
    expect(escActionFor(base({ commandPanelOpen: true, generating: true, agentsActive: true }))).toEqual({ kind: 'none' });
    expect(escActionFor(base({ commandPanelOpen: true, confirmStop: true }))).toEqual({ kind: 'none' });
  });

  test('兜底层排位：仅让本地浮层先行；面板开着时吸收 Esc 不穿透到任何整页/内嵌层', () => {
    expect(escActionFor(base({ localDialogOpen: true, commandPanelOpen: true }))).toEqual({ kind: 'close-local-dialog' });
    expect(escActionFor(base({ commandPanelOpen: true, settingsOpen: true }))).toEqual({ kind: 'none' });
  });

  test('生成中：有在途子代理先确认，否则直接停止；确认条开着则执行停止', () => {
    expect(escActionFor(base({ generating: true, agentsActive: true }))).toEqual({ kind: 'ask-confirm-stop' });
    expect(escActionFor(base({ generating: true }))).toEqual({ kind: 'stop-turn' });
    expect(escActionFor(base({ generating: true, confirmStop: true }))).toEqual({ kind: 'execute-confirmed-stop' });
  });
});