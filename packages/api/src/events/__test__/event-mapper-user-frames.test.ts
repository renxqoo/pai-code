import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '../event-mapper';
import type { EventMapper } from '../event-mapper';

type Frame = Parameters<EventMapper['mapEvent']>[0];

function frame(name: string, payload: Record<string, unknown>): Frame {
  return { threadId: 't', name, payload };
}

describe('user/message（用户气泡直通——事件帧上屏不等对账）', () => {
  const mapper = createEventMapper({ now: () => 1_000 });

  test.each([
    ['text 块载荷 → userMessage（origin 缺省回退 user）', { turn: 3, step: 0, content: [{ type: 'text', text: '你好' }] }, [{ type: 'userMessage', threadId: 't', message: { id: 'ev-t-3-0', text: '你好', origin: 'user' } }]],
    ['origin=system；多 text 块换行拼接；图片块跳过', { turn: 1, step: 2, origin: 'system', content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }, { type: 'text', text: 'b' }] }, [{ type: 'userMessage', threadId: 't', message: { id: 'ev-t-1-2', text: 'a\nb', origin: 'system' } }]],
    ['空文本（纯图）→ 丢弃（不产空气泡）', { turn: 0, step: 0, content: [{ type: 'image', data: 'x' }] }, []],
    ['垃圾载荷 → 丢弃', {}, []],
    ['子会话帧（payload.session ≠ threadId）不进主时间线', { session: 'child-s', turn: 0, step: 0, content: [{ type: 'text', text: 'hi' }] }, []],
  ])('%s', (_label, payload, expected) => {
    expect(mapper.mapEvent(frame('user/message', payload as Record<string, unknown>))).toEqual(expected);
  });
});

describe('git/changed（hub 自产帧——外部 checkout 失效信号）', () => {
  const mapper = createEventMapper({ now: () => 1_000 });

  test.each([
    ['payload {cwd, branch} → gitChanged', { cwd: '/w/repo', branch: 'feat/x' }, [{ type: 'gitChanged', threadId: 't', cwd: '/w/repo', branch: 'feat/x' }]],
    ['branch 键缺席（detached）→ 无 branch 键', { cwd: '/w/repo' }, [{ type: 'gitChanged', threadId: 't', cwd: '/w/repo' }]],
    ['cwd 缺失（垃圾帧）→ 丢弃', {}, []],
    ['cwd 空 → 丢弃', { cwd: '', branch: 'x' }, []],
  ])('%s', (_label, payload, expected) => {
    expect(mapper.mapEvent(frame('git/changed', payload))).toEqual(expected);
  });
});
