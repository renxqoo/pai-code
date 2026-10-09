/**
 * 线协议镜像对拍：CommandError 归一器与 scope 矩阵必须与 x-harness
 * remote-protocol 逐字一致——fork 漂移会让设备面读到不存在的形状或被
 * 判 unknown-command 的命令。
 */
import { describe, expect, test } from 'bun:test';

import { HOST_COMMAND_MATRIX, commandError, readCommandError } from '../index';

const X_HARNESS_VOCAB = new URL('../../../../../x-harness/packages/remote-protocol/src/vocab.ts', import.meta.url);

async function xHarnessMatrix(): Promise<Record<string, unknown>> {
  const mod = (await import(X_HARNESS_VOCAB.href)) as { HOST_COMMAND_MATRIX: Record<string, unknown> };
  return mod.HOST_COMMAND_MATRIX;
}

describe('CommandError 归一器（症状：失败只显示未知错误）', () => {
  test('host 的 {code,message} 原样可读回', () => {
    expect(readCommandError({ code: 'thread_not_live', message: 'thread parked' })).toEqual({
      code: 'thread_not_live',
      message: 'thread parked',
    });
  });

  test('无 message 只带 code；message 非字符串丢弃', () => {
    expect(readCommandError({ code: 'unknown_command' })).toEqual({ code: 'unknown_command' });
    expect(readCommandError({ code: 'unknown_command', message: 7 })).toEqual({ code: 'unknown_command' });
  });

  test('垃圾输入降级 null', () => {
    for (const junk of ['boom', [], null, undefined, { code: '' }, { message: 'no code' }]) {
      expect(readCommandError(junk)).toBeNull();
    }
  });

  test('写出形状能被自己读回', () => {
    expect(readCommandError(commandError('model_unavailable', 'no such model'))).toEqual({
      code: 'model_unavailable',
      message: 'no such model',
    });
  });
});

describe('scope 矩阵与 x-harness 对拍', () => {
  test('逐行相等（含档位），行数一致', async () => {
    const upstream = await xHarnessMatrix();
    expect(Object.keys(HOST_COMMAND_MATRIX).sort()).toEqual(Object.keys(upstream).sort());
    for (const [command, row] of Object.entries(HOST_COMMAND_MATRIX)) {
      expect([command, row]).toEqual([command, upstream[command]]);
    }
  });

  test('症状「get_token_analytics 从设备发被判 unknown-command」：用量查询面四档放行', () => {
    expect(HOST_COMMAND_MATRIX['get_token_analytics']).toEqual({ read: true, interact: true, full: true, ownerOnly: false });
  });

  test('信任裁定只走 owner；装卸与 hot 装按实现语义分档', () => {
    expect(HOST_COMMAND_MATRIX['plugins/trusted_source/confirm']).toEqual({ read: false, interact: false, full: false, ownerOnly: true });
    expect(HOST_COMMAND_MATRIX['plugins/trusted_source/reject']).toEqual({ read: false, interact: false, full: true, ownerOnly: false });
    expect(HOST_COMMAND_MATRIX['plugins/hot_install']).toEqual({ read: false, interact: true, full: true, ownerOnly: false });
    expect(HOST_COMMAND_MATRIX['workflow/submit']).toEqual({ read: false, interact: true, full: true, ownerOnly: false });
    expect(HOST_COMMAND_MATRIX['permission/list_rules']).toEqual({ read: true, interact: true, full: true, ownerOnly: false });
  });

  test('行值单调（read ⊆ interact ⊆ full）；owner-only 行三档全 false', () => {
    for (const [command, row] of Object.entries(HOST_COMMAND_MATRIX)) {
      const r = row as { read: boolean; interact: boolean; full: boolean; ownerOnly: boolean };
      if (r.ownerOnly) {
        expect([command, r.read, r.interact, r.full]).toEqual([command, false, false, false]);
        continue;
      }
      expect([command, r.full]).toEqual([command, true]);
      expect([command, r.read && !r.interact]).toEqual([command, false]);
    }
  });
});