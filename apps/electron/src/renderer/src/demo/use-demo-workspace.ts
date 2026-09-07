import * as React from 'react';

import { createUserMessage } from '@/thread/create-user-message';
import type { SessionMessage, ThreadModel } from '@/thread/thread-model';

import { deriveDemoThread, type StopTable } from './derive-demo-thread';
import { buildFollowUpScript } from './demo-turn-script';
import type { WorkspaceDemo } from './demo-workspace';

type ExtraTurn = {
  message: SessionMessage;
  turnId: string;
  startedAt: number;
};

const TICK_MS = 1000;

export type DemoWorkspaceState = {
  threads: Readonly<Record<string, ThreadModel>>;
  /** 观察时刻：有活动时每秒推进，是整个界面唯一的计时驱动源 */
  now: number;
  /** 是否仍有活动（运行中的轮次或进行中的子代理），驱动计时器启停 */
  hasActivity: boolean;
  submitDraft: (sessionId: string, draft: string) => boolean;
  stopActiveTurn: (sessionId: string) => void;
};

function emptyThread(sessionId: string): ThreadModel {
  return { sessionId, items: [], agents: [] };
}

function hasLiveActivity(threads: Readonly<Record<string, ThreadModel>>): boolean {
  for (const thread of Object.values(threads)) {
    for (const item of thread.items) {
      if (item.kind === 'turn' && item.turn.status === 'running') return true;
    }
    if (thread.agents.some((agent) => agent.status === 'working')) return true;
  }
  return false;
}

function lastRunningTurn(thread: ThreadModel | undefined): string | null {
  if (thread === undefined) return null;
  for (let index = thread.items.length - 1; index >= 0; index -= 1) {
    const item = thread.items[index];
    if (item?.kind === 'turn' && item.turn.status === 'running') return item.turn.id;
  }
  return null;
}

/**
 * 演示工作区状态：交互只写入提交与停止的意图，
 * 会话视图一律由纯推导按观察时刻产出；计时器随活动启停，卸载即清理。
 */
export function useDemoWorkspace(demo: WorkspaceDemo): DemoWorkspaceState {
  const [extraTurns, setExtraTurns] = React.useState<Readonly<Record<string, readonly ExtraTurn[]>>>({});
  const [stops, setStops] = React.useState<StopTable>({});
  const [now, setNow] = React.useState(() => Date.now());

  const threads: Record<string, ThreadModel> = {};
  for (const session of demo.sessions) {
    const spec = demo.threads[session.id];
    if (spec === undefined) {
      threads[session.id] = emptyThread(session.id);
      continue;
    }
    const extras = extraTurns[session.id] ?? [];
    const items = [
      ...spec.items,
      ...extras.flatMap((extra) => [
        { kind: 'message' as const, message: extra.message },
        { kind: 'live-turn' as const, turnId: extra.turnId, startedAt: extra.startedAt, script: buildFollowUpScript() },
      ]),
    ];
    threads[session.id] = deriveDemoThread({ sessionId: session.id, items }, now, stops);
  }

  const hasActivity = hasLiveActivity(threads);

  React.useEffect(() => {
    if (!hasActivity) return;
    const handle = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      window.clearInterval(handle);
    };
  }, [hasActivity]);

  const submitDraft = React.useCallback((sessionId: string, draft: string): boolean => {
    const result = createUserMessage(draft);
    if (!result.ok) return false;
    const turnId = `turn-${crypto.randomUUID()}`;
    setExtraTurns((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] ?? []), { message: result.message, turnId, startedAt: Date.now() }],
    }));
    setNow(Date.now());
    return true;
  }, []);

  const stopActiveTurn = (sessionId: string): void => {
    const turnId = lastRunningTurn(threads[sessionId]);
    if (turnId === null) return;
    setStops((current) =>
      current[`${sessionId}:${turnId}`] === undefined ? { ...current, [`${sessionId}:${turnId}`]: Date.now() } : current,
    );
    setNow(Date.now());
  };

  return { threads, now, hasActivity, submitDraft, stopActiveTurn };
}
