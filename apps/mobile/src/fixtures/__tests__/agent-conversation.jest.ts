import { describe, expect, it } from '@jest/globals';
import { agentConversation } from '@/fixtures/agent-conversation';
import { buildTurns } from '@/features/chat/turns';
import { parseMarkdown } from '@/features/chat/markdown/parse-markdown';

describe('agentConversation fixture', () => {
  it('covers the real multi-turn journey with system notices and a running step', () => {
    const { messages } = agentConversation;
    expect(messages.filter((message) => message.kind === 'user')).toHaveLength(8);
    expect(messages.filter((message) => message.kind === 'system').length).toBeGreaterThanOrEqual(3);
    expect(messages.some((message) => message.kind === 'thinking')).toBe(true);
    expect(messages.some((message) => message.kind === 'code')).toBe(true);
    expect(messages.filter((message) => message.status === 'failed').length).toBeGreaterThanOrEqual(5);
    expect(messages.some((message) => message.status === 'running')).toBe(true);
    expect(messages.at(-1)?.status).toBe('running');

    const turns = buildTurns(messages);
    expect(turns.some((turn) => turn.stream.length > 0)).toBe(true);
    expect(turns.some((turn) => turn.result !== null)).toBe(true);
  });

  it('keeps every failure followed by a retry in the same journey', () => {
    const { messages } = agentConversation;
    const failures = messages.filter((message) => message.status === 'failed');
    expect(failures.length).toBeGreaterThan(0);
    for (const failure of failures) {
      const index = messages.indexOf(failure);
      expect(messages.slice(index).some((message) => message.status === 'ok' && message.kind === 'tool')).toBe(true);
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

  it('exercises the execution IA: 并行批次、同文件归并、子代理清单、失败退出码、命令摘要', () => {
    const tools = agentConversation.messages.filter((message) => message.kind === 'tool');
    // 并行批次原料：连续工具调用（≥2）在流里成组
    const turns = buildTurns(agentConversation.messages);
    expect(turns.some((turn) => turn.stream.filter((item) => item.kind === 'tool').length >= 2)).toBe(true);
    // 同一文件多次编辑 → 一个 diff 归并
    const editPaths = tools.flatMap((message) => (message.editHunks ?? []).map((hunk) => hunk.path));
    expect(new Set(editPaths).size).toBeLessThan(editPaths.length);
    // 子代理执行清单
    expect(tools.some((message) => (message.subagents ?? []).length > 0)).toBe(true);
    // 失败行携带退出码
    const failed = tools.filter((message) => message.status === 'failed');
    expect(failed.every((message) => typeof message.exitCode === 'number')).toBe(true);
    // 命令摘要原料：bash 命令原文保留换行能力（非空 argsPreview）
    expect(tools.every((message) => (message.argsPreview ?? '').length > 0 || (message.subagents ?? []).length > 0)).toBe(true);
    // 轮级变更摘要可派生
    expect(turns.some((turn) => turn.changedFiles !== null)).toBe(true);
  });

  it('keeps the first failure before the first retry so the timeline exposes a failed activity', () => {
    const { messages } = agentConversation;
    const failure = messages.findIndex((message) => message.status === 'failed');
    const retry = messages.findIndex((message) => message.id === 'tool-web-preview-retry');
    expect(failure).toBeGreaterThanOrEqual(0);
    expect(retry).toBeGreaterThan(failure);
    const retried = messages[retry];
    expect(retried?.status).toBe('ok');
  });
});
