import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { NewTaskPage } from '../new-task-page';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import { copy } from '@/strings';
import type { SessionView } from '@paiapp/contracts';

/** 新建任务页装配（T34 M3）：订阅随页挂卸——问候语/已知目录/hostDown 文案数据面。 */

function seedSession(threadId: string, cwd: string): SessionView {
  return {
    threadId,
    cwd,
    sessionPath: `/tmp/${cwd}/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state: 'live',
    streaming: false,
    model: 'm',
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

describe('NewTaskPage', () => {
  test('整页装配：问候语 + 输入卡在位（knownDirs 经 store 派生）', () => {
    liveStore.setState({
      sessions: { t1: seedSession('t1', 'tmp/pai') },
      activeThreadId: 't1',
      threads: { t1: initialThreadState },
    });
    const view = render(<NewTaskPage enterCwd="" />);
    const textarea = view.container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.getAttribute('placeholder')).toBe(copy.newTask.placeholder);
    view.unmount();
  });

  test('enterCwd 预填：上下文条显示项目名', () => {
    liveStore.setState({ threads: {} });
    const view = render(<NewTaskPage enterCwd="/tmp/preselected" />);
    expect(view.container.textContent).toContain('preselected');
    view.unmount();
  });

  test('hostDown：模型位换「宿主未连接」引导', () => {
    liveStore.setState({ hostPhase: 'failed' });
    const view = render(<NewTaskPage enterCwd="" />);
    expect(view.container.textContent).toContain(copy.composer.hostDownModels.split('——')[0]);
    view.unmount();
  });
});
