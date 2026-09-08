import type { TurnModel } from '@/thread/thread-model';

import type { LiveThreadState } from './live-thread-state';

/** 轮次定位/更新与文本封顶：fold-events 与 fold-subagents 共享的轮操作。 */

const MAX_TURN_CHARS = 4 * 1024 * 1024;

/** 从尾向前找轮（live 轮恒在尾部附近，避免长会话每次从头扫）。 */
export function findTurn(state: LiveThreadState, turnId: string | null): TurnModel | null {
  if (turnId === null) return null;
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item?.kind === 'turn' && item.turn.id === turnId) return item.turn;
  }
  return null;
}

export function updateTurn(state: LiveThreadState, turnId: string, patch: (turn: TurnModel) => TurnModel): LiveThreadState {
  return {
    ...state,
    items: state.items.map((item) => (item.kind === 'turn' && item.turn.id === turnId ? { kind: 'turn', turn: patch(item.turn) } : item)),
  };
}

export function clip(text: string): string {
  return text.length > MAX_TURN_CHARS ? text.slice(0, MAX_TURN_CHARS) : text;
}
