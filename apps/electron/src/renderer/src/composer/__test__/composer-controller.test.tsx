import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { editQueuedDraft, insertIntoDraft, registerComposerTextarea, setDraftAndFocus, unregisterComposerTextarea } from '../composer-controller';
import { stopOrAbort } from '../stop-or-abort';
import { submitComposerDraft } from '../submit-composer-draft';
import { queuedDrafts } from '@/composer/queued-drafts';
import { initialThreadState, type LiveThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import type { SessionView } from '@paiapp/contracts';

/** 输入卡编排模块：通道（插入/替换/聚焦/排队编辑）、停止三态、提交三分支——全部读 store 真相。 */

function seedThread(threadId: string, thread: Partial<LiveThreadState> = {}): void {
  const session: SessionView = {
    threadId,
    cwd: '/tmp/t38',
    sessionPath: `/tmp/t38/s/${threadId}.jsonl`,
    title: '会话',
    state: 'live',
    streaming: false,
    model: 'openai/gpt',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
  liveStore.setState({
    sessions: { [threadId]: session },
    activeThreadId: threadId,
    threads: { [threadId]: { ...initialThreadState, ...thread } },
  });
}

/** 挂一个真实 textarea 进 DOM 并注册（聚焦断言用；返回元素句柄做同一性断言）。 */
function mountTextarea(): { el: HTMLTextAreaElement; unmount: () => void } {
  const view = render(<textarea aria-label="t" />);
  const el = view.container.querySelector('textarea') as HTMLTextAreaElement;
  registerComposerTextarea(el);
  return { el, unmount: () => { unregisterComposerTextarea(el); view.unmount(); } };
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
  jest.restoreAllMocks();
});

describe('composer-controller', () => {
  test('insertIntoDraft：空草稿直接拼；非空草稿去尾空白补一个空格再拼（palette `/skill ` 语义）', () => {
    seedThread('t1');
    insertIntoDraft('/param ');
    expect(uiStore.getState().drafts.t1).toBe('/param ');
    uiStore.getState().setDraft('t1', '已有草稿  ');
    insertIntoDraft('/param ');
    expect(uiStore.getState().drafts.t1).toBe('已有草稿 /param ');
  });

  test('insertIntoDraft：无活跃线程写 composerDraft 槽', () => {
    liveStore.setState({ activeThreadId: null });
    insertIntoDraft('/x ');
    expect(uiStore.getState().composerDraft).toBe('/x ');
    expect(uiStore.getState().drafts).toEqual({});
  });

  test('setDraftAndFocus：替换活跃线程草稿 + 聚焦注册的 textarea', () => {
    seedThread('t1');
    uiStore.getState().setDraft('t1', '旧草稿');
    const mounted = mountTextarea();
    setDraftAndFocus('替换后');
    expect(uiStore.getState().drafts.t1).toBe('替换后');
    expect((document.activeElement as HTMLTextAreaElement | null)?.tagName).toBe('TEXTAREA');
    mounted.unmount();
  });

  test('注册通道：后注册者接管聚焦；全部注销后聚焦为安全 no-op（newTask 往返重挂场景）', () => {
    const first = mountTextarea();
    const second = mountTextarea();
    setDraftAndFocus('x');
    expect(document.activeElement).toBe(second.el); // 同一性断言：聚焦落在后注册元素
    second.unmount();
    first.unmount();
    setDraftAndFocus('y'); // 通道无元素：不抛错，草稿替换照常
    expect(uiStore.getState().composerDraft).toBe('y');
  });

  test('editQueuedDraft：取出活跃线程暂存条目回填草稿并产生一次性图片信号；同 id 再取无副作用', () => {
    seedThread('t1');
    queuedDrafts.stage('t1', '/tmp/t38/s/t1.jsonl', '排队内容', [{ name: '图.png', payload: { data: 'd', mimeType: 'image/png' } }]);
    const id = queuedDrafts.snapshot().t1?.[0]?.id;
    expect(id).toBeDefined();
    editQueuedDraft(id as number);
    expect(uiStore.getState().drafts.t1).toBe('排队内容');
    const restore = uiStore.getState().composerRestore;
    expect(restore?.token).toBeGreaterThan(0);
    expect(restore?.images).toHaveLength(1);
    const before = uiStore.getState().drafts.t1;
    editQueuedDraft(id as number);
    expect(uiStore.getState().drafts.t1).toBe(before);
  });
});

describe('stop-or-abort 三态（读 store 真相）', () => {
  test('bash 在途→中止（不停止）', () => {
    seedThread('t1', { bashRunning: true });
    const abort = jest.spyOn(workspaceActions, 'abortBash');
    const stop = jest.spyOn(workspaceActions, 'stopActiveTurn');
    stopOrAbort();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  test('在途子代理且生成中→开确认条；确认前不停止', () => {
    seedThread('t1', {
      streaming: true,
      agents: [
        {
          id: 'a1',
          agentId: 'sub-1',
          name: '探索',
          agentType: 'Explore',
          task: '',
          model: 'm',
          effort: 'high',
          tokens: 1,
          toolCount: 0,
          status: 'busy',
          startedAt: 1,
          endedAt: null,
          summary: '',
          pendingAsk: null,
          tools: [],
        },
      ],
    });
    const stop = jest.spyOn(workspaceActions, 'stopActiveTurn');
    stopOrAbort();
    expect(uiStore.getState().confirmStop).toBe(true);
    expect(stop).not.toHaveBeenCalled();
  });

  test('生成中无子代理→直接停止；确认条不开', () => {
    seedThread('t1', { streaming: true });
    const stop = jest.spyOn(workspaceActions, 'stopActiveTurn');
    stopOrAbort();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(uiStore.getState().confirmStop).toBe(false);
  });
});

describe('submit-composer-draft 三分支（读 store 真相）', () => {
  test('生成中普通消息→本地暂存 + 清草稿 + resolve true（PromptCard 据此清附件）', async () => {
    // queuedDrafts 是无 reset 的模块单例：各用例独立线程 id 隔离暂存残留
    seedThread('t-stage', { streaming: true });
    uiStore.getState().setDraft('t-stage', '排队消息');
    const sent = await submitComposerDraft('排队消息', []);
    expect(sent).toBe(true);
    expect(queuedDrafts.snapshot()['t-stage'] ?? []).toHaveLength(1);
    expect(uiStore.getState().composerDraft).toBe('');
    expect('t-stage' in uiStore.getState().drafts).toBe(false);
  });

  test('生成中行首斜杠命令不暂存（直发通路；离线桥下失败草稿保留）', async () => {
    seedThread('t-slash', { streaming: true });
    uiStore.getState().setDraft('t-slash', '/compact');
    const sent = await submitComposerDraft('/compact', []);
    expect(sent).toBe(false);
    expect(queuedDrafts.snapshot()['t-slash'] ?? []).toHaveLength(0);
    expect(uiStore.getState().drafts['t-slash']).toBe('/compact');
  });

  test('空闲直发：空文本空附件拦截 false，草稿不动', async () => {
    seedThread('t-empty');
    uiStore.getState().setDraft('t-empty', '   ');
    const sent = await submitComposerDraft('   ', []);
    expect(sent).toBe(false);
    expect(uiStore.getState().drafts['t-empty']).toBe('   ');
  });
});
