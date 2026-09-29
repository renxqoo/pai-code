import { describe, expect, test } from 'bun:test';

import { autoOpenForCall, autoOpenForGroup, callExpandable, detailOutput } from '../tool-call-detail';

describe('callExpandable', () => {
  test('有输出可展开，无输出（尚未产出/纯状态单元）不可展开', () => {
    expect(callExpandable({ output: 'line' })).toBe(true);
    expect(callExpandable({ output: '' })).toBe(false);
  });

  test('症状回归：edit 无输出不可展开——补丁在文件级 diff 区，留在行详情里会变成「有箭头、点了空白」的死开关', () => {
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

describe('autoOpenForGroup（症状回归：并行组合并时先开后关闪一下）', () => {
  test('运行中不自动展开——「开始即展开、完成即收起」的开合对即闪现源（合并后几帧即收）', () => {
    expect(autoOpenForGroup([{ status: 'running' }, { status: 'running' }])).toBe(false);
    expect(autoOpenForGroup([{ status: 'ok' }, { status: 'running' }])).toBe(false);
    expect(autoOpenForGroup([{ status: 'running' }, { status: 'ok' }])).toBe(false);
  });

  test('失败常开（错误必须在组级看得见）；成功/停止收起', () => {
    expect(autoOpenForGroup([{ status: 'ok' }, { status: 'failed' }])).toBe(true);
    expect(autoOpenForGroup([{ status: 'stopped' }, { status: 'failed' }])).toBe(true);
    expect(autoOpenForGroup([{ status: 'ok' }, { status: 'stopped' }])).toBe(false);
    expect(autoOpenForGroup([{ status: 'ok' }])).toBe(false);
    expect(autoOpenForGroup([])).toBe(false);
  });

  test('与调用级同一裁决（单一口径）：组自动展开 ⟺ 任一调用自动展开', () => {
    const statuses = ['ok', 'running', 'failed', 'stopped'] as const;
    for (const first of statuses) {
      for (const second of statuses) {
        const calls = [{ status: first }, { status: second }];
        expect(autoOpenForGroup(calls)).toBe(calls.some((call) => autoOpenForCall(call)));
      }
    }
  });
});

describe('detailOutput', () => {
  test('结束态显示全量输出', () => {
    expect(detailOutput({ status: 'ok', output: 'a\nb' })).toBe('a\nb');
    expect(detailOutput({ status: 'failed', output: 'boom' })).toBe('boom');
  });

  test('运行中只显示头部片段（命令回显与最早输出先到，用户盯的是结果面）', () => {
    // 上限 2000：head 占 4，x 取 1996
    const long = `head${'x'.repeat(2500)}`;
    expect(detailOutput({ status: 'running', output: long })).toBe(`head${'x'.repeat(1996)}`);
    expect(detailOutput({ status: 'running', output: 'short' })).toBe('short');
  });

  test('恰好等于上限不截断', () => {
    const exact = 'y'.repeat(2000);
    expect(detailOutput({ status: 'running', output: exact })).toBe(exact);
  });
});
