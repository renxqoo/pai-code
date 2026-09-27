import { describe, expect, it } from '@jest/globals';
import { agentConversation } from '@/fixtures/agent-conversation';
import { buildTurns } from '@/features/chat/turns';
import { MarkedLexer, type Token } from 'react-native-marked';

/** 递归收集 marked 词法类型（夹具词表覆盖门：块级 + 行内）。 */
function collectTokenTypes(tokens: readonly Token[], acc: Set<string>): void {
  for (const token of tokens) {
    acc.add(token.type);
    const nested = (token as { tokens?: readonly Token[] }).tokens;
    if (nested !== undefined) collectTokenTypes(nested, acc);
    const items = (token as { items?: readonly { tokens?: readonly Token[] }[] }).items;
    if (items !== undefined) {
      for (const item of items) if (item.tokens !== undefined) collectTokenTypes(item.tokens, acc);
    }
  }
}

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

  it('covers every markdown block/inline kind through the marked lexer', () => {
    const kinds = new Set<string>();
    for (const message of agentConversation.messages) {
      if (message.kind !== 'assistant') continue;
      collectTokenTypes(MarkedLexer(message.text), kinds);
    }
    expect(kinds).toContain('heading');
    expect(kinds).toContain('paragraph');
    expect(kinds).toContain('list');
    expect(kinds).toContain('blockquote');
    expect(kinds).toContain('hr');
    expect(kinds).toContain('code');

    expect(kinds).toContain('strong');
    expect(kinds).toContain('em');
    expect(kinds).toContain('codespan');
    expect(kinds).toContain('link');
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
