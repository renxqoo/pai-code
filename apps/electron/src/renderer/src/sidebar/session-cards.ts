import type { SessionView } from '@paiapp/contracts';

import { baseNameOf } from '@/lib/project-dirs';
import type { SessionCardModel } from '@/sidebar/session-card-model';

/**
 * 会话注册表 → 侧栏会话卡列表（最近活跃倒序）：useLiveWorkspace 与侧栏列表区
 * 共用的单一派生真相。WeakMap 按输入引用缓存——无关 set 不产出新引用，
 * 不击穿下游 memo（先例：live/store 的 threadModelOf）。
 */

const cardCache = new WeakMap<Readonly<Record<string, SessionView>>, readonly SessionCardModel[]>();

export function sessionCardsOf(sessions: Readonly<Record<string, SessionView>>): readonly SessionCardModel[] {
  const cached = cardCache.get(sessions);
  if (cached !== undefined) return cached;
  const cards = Object.values(sessions)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .map((session) => ({
      id: session.threadId,
      projectName: baseNameOf(session.cwd) || session.cwd,
      title: session.title,
      version: session.model ?? '',
      cwd: session.cwd,
      sessionPath: session.sessionPath,
      state: session.state,
      streaming: session.streaming,
      lastActivityAt: session.lastActivityAt,
    }));
  cardCache.set(sessions, cards);
  return cards;
}
