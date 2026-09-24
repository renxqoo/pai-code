import { describe, expect, test } from 'bun:test';

import { confirmPromptLine } from '../confirm-prompt-line';
import type { PendingDialog } from '@/live/store';

/**
 * 确认条信息行单源（统一工具提示文案）：主文案 = 「工具 + 目标」（summary：文件路径/命令），
 * 裁决原因只进悬停技术详情。回归症状：审批确认文案曾显示「edit unknown tool:edit」，
 * 确认方无从得知要改哪个文件。
 */

const base: PendingDialog = {
  requestId: 'r1',
  threadId: 't1',
  method: 'confirm',
  tool: 'edit',
  summary: 'src/a.ts',
  reason: 'edit-confirm: in-root write',
};

describe('confirmPromptLine 统一工具提示文案', () => {
  test('症状回归：曾显示 unknown tool:edit、不知改哪个文件——主文案现为「工具 + 目标」，原因只在悬停', () => {
    const line = confirmPromptLine(base);
    expect(line?.text).toBe('edit src/a.ts');
    expect(line?.text).not.toContain('unknown tool');
    expect(line?.hover).toBe('src/a.ts\nedit-confirm: in-root write');
  });

  test('summary 缺席回退 reason 当目标（plugin_propose 等只有原因的确认面不丢信息）', () => {
    const line = confirmPromptLine({ ...base, summary: undefined, reason: 'plugin proposal: name=x' });
    expect(line?.text).toBe('edit plugin proposal: name=x');
  });

  test('缺省字段组合：只给工具/只给目标各自成立；全缺席不渲染空壳', () => {
    expect(confirmPromptLine({ requestId: 'r', threadId: 't', method: 'confirm', tool: 'bash' })?.text).toBe('bash');
    expect(confirmPromptLine({ requestId: 'r', threadId: 't', method: 'confirm', summary: 'ls' })?.text).toBe('ls');
    expect(confirmPromptLine({ requestId: 'r', threadId: 't', method: 'confirm' })).toBeNull();
  });

  test('空串垃圾值降级（跨进程帧字段）：空 summary 视同缺席', () => {
    const line = confirmPromptLine({ ...base, tool: '', summary: '' });
    expect(line?.text).toBe('edit-confirm: in-root write');
    expect(line?.hover).toBe('edit-confirm: in-root write');
  });
});
