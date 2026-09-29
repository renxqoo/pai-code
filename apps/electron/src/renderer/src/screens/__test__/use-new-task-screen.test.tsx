import { afterEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';

import { render } from '@/testing/render';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

import { useNewTaskScreen } from '../use-new-task-screen';
import type { NewTaskScreenProps } from '../new-task-screen';
import type { NewTaskStart } from '../start-task';

/**
 * 新建任务页装配：提交链透传（cwd/model/text 原样进入 startTask）。
 */

type Slot = { props: NewTaskScreenProps | null };

function Probe({ slot }: { slot: Slot }): null {
  slot.props = useNewTaskScreen('/w/app');
  return null;
}

const START: NewTaskStart = {
  cwd: '/w/app',
  trusted: false,
  model: 'glm/glm-4.7',
  permissionMode: null,
  thinkingLevel: null,
  text: '开工',
  attachments: [],
};

afterEach(() => {
  jest.restoreAllMocks();
  liveStore.getState().reset();
  uiStore.getState().reset();
});

describe('useNewTaskScreen 提交链装配', () => {
  let unmountProbe: (() => void) | null = null;

  afterEach(() => {
    unmountProbe?.();
    unmountProbe = null;
  });

  async function mount(): Promise<Slot> {
    jest.spyOn(workspaceActions, 'fetchCommandPreview').mockResolvedValue([]);
    const slot: Slot = { props: null };
    const view = render(<Probe slot={slot} />);
    unmountProbe = view.unmount;
    await React.act(async () => {
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    });
    if (slot.props === null) throw new Error('props 未就绪');
    return slot;
  }

  test('onCreate 透传 startTask（cwd/text 原样）', async () => {
    const startTask = jest.spyOn(workspaceActions, 'startTask').mockResolvedValue({ ok: true, threadId: 'nt1', sendFailed: false });
    const slot = await mount();
    await React.act(async () => {
      const ok = await (slot.props as NewTaskScreenProps).onCreate(START);
      expect(ok).toBe(true);
    });
    expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ cwd: START.cwd, text: '开工' }));
  });
});
