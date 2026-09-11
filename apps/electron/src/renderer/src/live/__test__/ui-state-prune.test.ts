import { describe, expect, test } from 'bun:test';

import type { SessionView } from '@paiapp/contracts';

import { connectSessionUiPrune } from '../ui-state-prune';
import { createLiveStore } from '../store';
import { createUiStore } from '@/ui/ui-store';
import { initialThreadState } from '@/live/live-thread-state';
import { EMPTY_PANEL, type PanelArchive } from '@/panel/panel-state';

/**
 * 会话消亡 UI 态回收回归：sessionRemoved 后线程 id 不复用，草稿槽与面板档案
 * 随 sessions 表差集回收；宿主死亡/threads 推进不清 sessions 表，不得误伤。
 */

function session(threadId: string): SessionView {
  return {
    threadId,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state: 'live',
    streaming: false,
    model: 'openai/gpt',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
}

function setup(): { live: ReturnType<typeof createLiveStore>; ui: ReturnType<typeof createUiStore>; archive: PanelArchive } {
  const live = createLiveStore();
  const ui = createUiStore();
  const archive: PanelArchive = new Map([['t1', EMPTY_PANEL]]);
  live.setState({ sessions: { t1: session('t1'), t2: session('t2') } });
  ui.setState({ drafts: { t1: '遗留草稿', t2: '在用草稿' } });
  return { live, ui, archive };
}

describe('会话消亡 UI 态回收', () => {
  test('症状：死线程草稿槽与面板档案残留——sessionRemoved 后随差集回收，幸存线程不受影响', () => {
    const { live, ui, archive } = setup();
    const disconnect = connectSessionUiPrune(live, ui, archive);
    live.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, Date.now());
    expect(ui.getState().drafts).toEqual({ t2: '在用草稿' });
    expect(archive.size).toBe(0);
    disconnect();
  });

  test('宿主死亡与 threads 推进不清 sessions 表——草稿与档案不误伤', () => {
    const { live, ui, archive } = setup();
    const disconnect = connectSessionUiPrune(live, ui, archive);
    live.getState().applyEvent({ type: 'host', phase: 'failed' }, Date.now());
    live.setState({ threads: { t1: { ...initialThreadState, streaming: true } } });
    expect(ui.getState().drafts).toEqual({ t1: '遗留草稿', t2: '在用草稿' });
    expect(archive.get('t1')).toBe(EMPTY_PANEL);
    disconnect();
  });

  test('退订后不再回收', () => {
    const { live, ui, archive } = setup();
    const disconnect = connectSessionUiPrune(live, ui, archive);
    disconnect();
    live.getState().applyEvent({ type: 'sessionRemoved', threadId: 't1' }, Date.now());
    expect(ui.getState().drafts).toEqual({ t1: '遗留草稿', t2: '在用草稿' });
  });
});
