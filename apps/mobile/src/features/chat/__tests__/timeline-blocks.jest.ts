import { describe, expect, it } from '@jest/globals';
import { groupTimeline } from '@/features/chat/timeline-blocks';
import type { ChatMessage } from '@/types/domain';

const message = (id: string, kind: ChatMessage['kind']): ChatMessage => ({ id, kind, text: id, createdAt: 'now' });

describe('groupTimeline', () => {
  it('groups contiguous thinking and tool messages without crossing boundaries', () => {
    const blocks = groupTimeline([
      message('user', 'user'), message('think-1', 'thinking'), message('think-2', 'thinking'),
      message('answer-1', 'assistant'), message('tool-1', 'tool'), message('tool-2', 'tool'),
      message('answer-2', 'assistant'), message('think-3', 'thinking'),
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(['message', 'thinking', 'message', 'tools', 'message', 'thinking']);
    expect(blocks[1]?.kind === 'thinking' ? blocks[1].messages.length : 0).toBe(2);
    expect(blocks[3]?.kind === 'tools' ? blocks[3].messages.length : 0).toBe(2);
  });

  it('returns an empty timeline for no messages', () => {
    expect(groupTimeline([])).toEqual([]);
  });
});
