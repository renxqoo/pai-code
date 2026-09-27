import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { Text } from 'react-native';
import { useSessionElapsed } from '@/features/chat/use-session-elapsed';
import type { ConversationSession } from '@/types/domain';

const session = (values: Partial<ConversationSession>): ConversationSession => ({
  id: 's',
  title: 't',
  preview: '',
  project: 'p',
  timeLabel: '现在',
  state: 'idle',
  pinned: false,
  archived: false,
  unread: false,
  messages: [],
  ...values,
});

function SessionElapsedProbe({ value }: { value: ConversationSession }) {
  const elapsed = useSessionElapsed(value);
  return <Text testID="elapsed">{elapsed === undefined ? 'none' : String(elapsed)}</Text>;
}

describe('useSessionElapsed 会话级工作时长', () => {
  it('working 实时推进，终态冻结到 endedAtMs，无起点/无终点降级为空', async () => {
    const running = await render(<SessionElapsedProbe value={session({ state: 'working', startedAtMs: 1_000 })} />);
    expect(running.getByTestId('elapsed').props.children).not.toBe('none');

    const frozen = await render(<SessionElapsedProbe value={session({ state: 'idle', startedAtMs: 1_000, endedAtMs: 3_500 })} />);
    expect(frozen.getByTestId('elapsed').props.children).toBe('2500');

    const noStart = await render(<SessionElapsedProbe value={session({ state: 'working' })} />);
    expect(noStart.getByTestId('elapsed').props.children).toBe('none');

    const noEnd = await render(<SessionElapsedProbe value={session({ state: 'idle', startedAtMs: 1_000 })} />);
    expect(noEnd.getByTestId('elapsed').props.children).toBe('none');
  });
});
