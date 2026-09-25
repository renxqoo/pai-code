import { describe, expect, it } from '@jest/globals';
import { agentConversation } from '@/fixtures/agent-conversation';
import { groupTimeline } from '@/features/chat/timeline-blocks';
import { parseMarkdown } from '@/features/chat/markdown/parse-markdown';

describe('agentConversation fixture', () => {
  it('covers the real multi-turn journey with system notices and a running step', () => {
    const { messages } = agentConversation;
    expect(messages.filter((message) => message.kind === 'user')).toHaveLength(8);
    expect(messages.filter((message) => message.kind === 'system').length).toBeGreaterThanOrEqual(3);
    expect(messages.some((message) => message.kind === 'thinking')).toBe(true);
    expect(messages.some((message) => message.kind === 'code')).toBe(true);
    expect(messages.filter((message) => message.status === 'error').length).toBeGreaterThanOrEqual(5);
    expect(messages.some((message) => message.status === 'running')).toBe(true);
    expect(messages.at(-1)?.status).toBe('running');

    const blocks = groupTimeline(messages);
    expect(blocks.some((block) => block.kind === 'activity')).toBe(true);
  });

  it('keeps every failure followed by a retry in the same journey', () => {
    const { messages } = agentConversation;
    const failures = messages.filter((message) => message.status === 'error');
    for (const failure of failures) {
      const index = messages.indexOf(failure);
      expect(messages.slice(index).some((message) => message.status === 'success' && message.kind === 'tool')).toBe(true);
    }
  });

  it('renders every markdown block kind through the parser', () => {
    const markdown = agentConversation.messages
      .filter((message) => message.kind === 'assistant')
      .map((message) => parseMarkdown(message.text))
      .flat();
    const kinds = new Set(markdown.map((block) => block.kind));
    expect(kinds).toContain('heading');
    expect(kinds).toContain('paragraph');
    expect(kinds).toContain('list');
    expect(kinds).toContain('quote');
    expect(kinds).toContain('divider');
    expect(kinds).toContain('code');

    const inlineKinds = new Set(
      markdown.flatMap((block) =>
        block.kind === 'list'
          ? block.items.flatMap((item) => item.content.map((node) => node.kind))
          : block.kind === 'code' || block.kind === 'divider'
            ? []
            : block.content.map((node) => node.kind),
      ),
    );
    expect(inlineKinds).toContain('strong');
    expect(inlineKinds).toContain('emphasis');
    expect(inlineKinds).toContain('code');
    expect(inlineKinds).toContain('link');
  });

  it('keeps the first failure before the first retry so the timeline exposes a failed activity', () => {
    const { messages } = agentConversation;
    const failure = messages.findIndex((message) => message.status === 'error');
    const retry = messages.findIndex((message) => message.title === '改用绝对路径重试');
    expect(failure).toBeGreaterThanOrEqual(0);
    expect(retry).toBeGreaterThan(failure);
  });
});
