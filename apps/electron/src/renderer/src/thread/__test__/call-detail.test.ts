import { describe, expect, test } from 'bun:test';

import { autoOpenForCall, callExpandable, detailOutput } from '../call-detail';

describe('callExpandable', () => {
  test('有输出可展开，无输出（尚未产出/纯状态单元）不可展开', () => {
    expect(callExpandable({ output: 'line' })).toBe(true);
    expect(callExpandable({ output: '' })).toBe(false);
  });
});

describe('autoOpenForCall（症状回归：bash 短命令闪现输出面板）', () => {
  test('运行中一律不自动展开——「开始输出即展开、成功即收起」的开合对即闪烁源', () => {
    expect(autoOpenForCall({ status: 'running' })).toBe(false);
  });

  test('失败：保持展开；成功/停止：收起', () => {
    expect(autoOpenForCall({ status: 'failed' })).toBe(true);
    expect(autoOpenForCall({ status: 'ok' })).toBe(false);
    expect(autoOpenForCall({ status: 'stopped' })).toBe(false);
  });
});

describe('detailOutput', () => {
  test('结束态显示全量输出', () => {
    expect(detailOutput({ status: 'ok', output: 'a\nb' })).toBe('a\nb');
    expect(detailOutput({ status: 'failed', output: 'boom' })).toBe('boom');
  });

  test('运行中只显示尾部片段（增长中的输出头部无信息量）', () => {
    const long = `${'x'.repeat(2500)}tail`;
    expect(detailOutput({ status: 'running', output: long })).toBe(`${'x'.repeat(1996)}tail`);
    expect(detailOutput({ status: 'running', output: 'short' })).toBe('short');
  });

  test('恰好等于上限不截断', () => {
    const exact = 'y'.repeat(2000);
    expect(detailOutput({ status: 'running', output: exact })).toBe(exact);
  });
});
