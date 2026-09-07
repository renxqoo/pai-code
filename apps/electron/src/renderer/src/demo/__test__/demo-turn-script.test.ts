import { describe, expect, test } from 'bun:test';

import { buildAnalysisScript, buildFollowUpScript } from '../demo-turn-script';

describe('demo 剧本不变量', () => {
  test('子代理工具时间线顺序执行，同一时刻至多一个在跑', () => {
    for (const script of [buildAnalysisScript(), buildFollowUpScript()]) {
      for (const block of script.blocks) {
        if (block.kind !== 'subagents') continue;
        for (const seed of block.agents) {
          let cursor = 0;
          for (const tool of seed.tools) {
            expect(tool.atMs).toBeGreaterThanOrEqual(cursor);
            cursor = tool.atMs + tool.durationMs;
          }
        }
      }
    }
  });

  test('自动收尾时刻覆盖所有子代理的收尾时刻，自然完成不产生截断', () => {
    const script = buildAnalysisScript();
    expect(script.completeAtMs).not.toBeNull();
    for (const block of script.blocks) {
      if (block.kind !== 'subagents') continue;
      for (const seed of block.agents) {
        if (seed.doneAfterMs === null) continue;
        expect(block.atMs + seed.bornAtMs + seed.doneAfterMs).toBeLessThan(script.completeAtMs ?? 0);
      }
    }
  });

  test('命令块的时间线不越出自动收尾时刻', () => {
    const script = buildFollowUpScript();
    for (const block of script.blocks) {
      if (block.kind !== 'commands') continue;
      for (const step of block.commands) {
        expect(block.atMs + step.atMs + step.durationMs).toBeLessThan(script.completeAtMs ?? 0);
      }
    }
  });
});
