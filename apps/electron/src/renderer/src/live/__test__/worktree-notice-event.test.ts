import { expect, test } from 'bun:test';

import { createLiveController } from '../live-controller';
import { createLiveStore } from '../store';
import type { BridgeClient } from '../client-invoke';
import { copy } from '@/strings';
import { uiStore } from '@/ui/ui-store';

/** 建树通告投递结果事件（SESSION-WORKTREE-WORKFLOW §1.3 反馈分句）：busy/idle/deferred 三态成句 + 代次 bump。 */

function makeClient(): BridgeClient & { emitToController: (event: unknown) => void } {
  let listener: ((event: unknown) => void) | undefined;
  return {
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: (method: string): Promise<unknown> =>
      Promise.resolve(
        method === 'app/bootstrap'
          ? ({
              ok: true,
              data: {
                sessions: [],
                saved: [],
                models: [],
                providers: [],
                preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] },
                hostPhase: 'ready',
              },
            } as never)
          : ({ ok: true, data: null } as never),
      ),
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
      return () => {
        listener = undefined;
      };
    },
  };
}

test('worktreeNotice 三态分句 + branchRevision 递增（派生树 chip 随登记重读）', async () => {
  uiStore.getState().reset();
  const store = createLiveStore();
  const client = makeClient();
  const controller = createLiveController(client, store);
  await controller.start();
  const before = uiStore.getState().branchRevision;

  client.emitToController({ type: 'worktreeNotice', kind: 'busy', path: '/w/wt-a' });
  client.emitToController({ type: 'worktreeNotice', kind: 'idle', path: '/w/wt-b' });
  client.emitToController({ type: 'worktreeNotice', kind: 'deferred', path: '/w/wt-c' });

  const texts = store.getState().notices.map((notice) => notice.text);
  expect(texts).toEqual([
    copy.branch.wtCreatedBusy('/w/wt-a'),
    copy.branch.wtCreatedIdle('/w/wt-b'),
    copy.branch.wtCreatedDeferred('/w/wt-c'),
  ]);
  expect(uiStore.getState().branchRevision).toBe(before + 3);
  uiStore.getState().reset();
});
