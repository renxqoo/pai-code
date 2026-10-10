import { describe, expect, test } from 'bun:test';

import {
  GATEWAY_OWNER_FAILURE_CODES,
  gatewayFailureReason,
  readGatewayOwnerResponse,
} from '../gateway-protocol';

/**
 * 网关 owner 应答镜像（真相源 = x-harness apps/hub-gateway/src/owner-dispatch.ts）：
 * 失败面 error 恒为 commandError(code, message) 对象——曾按裸字符串判读，
 * 网关真实原因全部落进「网关未给出原因」兜底文案（症状回归）。
 */
describe('readGatewayOwnerResponse（网关 owner 应答收窄）', () => {
  test('成功应答：success:true + data 原样透传', () => {
    const result = readGatewayOwnerResponse({ id: 'o1', command: 'gw/status', success: true, data: { devices: 1 } });
    expect(result).toEqual({ ok: true, data: { devices: 1 } });
  });

  test('成功应答：data 缺席 → null（网关 gw/pairing/start 恒带 data）', () => {
    expect(readGatewayOwnerResponse({ success: true })).toEqual({ ok: true, data: null });
  });

  test('症状回归：失败应答 error 为 {code,message} 对象 → reason 取 message（非「网关未给出原因」兜底）', () => {
    const result = readGatewayOwnerResponse({
      success: false,
      error: { code: 'gw-command-failed', message: 'pairing ticket unavailable (relay enroll pending?)' },
    });
    expect(result).toEqual({ ok: false, reason: 'pairing ticket unavailable (relay enroll pending?)' });
  });

  test('失败应答：error 只有 code（无 message）→ reason 取 code', () => {
    const result = readGatewayOwnerResponse({ success: false, error: { code: 'owner-only' } });
    expect(result).toEqual({ ok: false, reason: 'owner-only' });
  });

  test('失败应答：error 缺失（host 透传命令 readCommandError ?? undefined 路径）→ reason 落兜底 code', () => {
    const result = readGatewayOwnerResponse({ success: false });
    expect(result).toEqual({ ok: false, reason: 'gw-command-failed' });
  });

  test('失败应答：error 为垃圾形状 → 兜底 code（垃圾输入降级不崩）', () => {
    expect(readGatewayOwnerResponse({ success: false, error: 'plain string' })).toEqual({ ok: false, reason: 'gw-command-failed' });
    expect(readGatewayOwnerResponse({ success: false, error: { code: 7 } })).toEqual({ ok: false, reason: 'gw-command-failed' });
    expect(readGatewayOwnerResponse({ success: false, error: null })).toEqual({ ok: false, reason: 'gw-command-failed' });
  });

  test('应答非对象 / success 非布尔 → null（调用方按无应答处理）', () => {
    expect(readGatewayOwnerResponse(null)).toBeNull();
    expect(readGatewayOwnerResponse('ok')).toBeNull();
    expect(readGatewayOwnerResponse({ success: 'yes' })).toBeNull();
  });
});

describe('gatewayFailureReason（合成失败原因的单一真相）', () => {
  test('message 优先于 code', () => {
    expect(gatewayFailureReason({ code: 'gw-command-failed', message: 'timeout' })).toBe('timeout');
  });

  test('无 message 用 code', () => {
    expect(gatewayFailureReason({ code: 'gateway-not-connected' })).toBe('gateway-not-connected');
  });
});

describe('GATEWAY_OWNER_FAILURE_CODES（IPC 管道合成错误 code 闭集）', () => {
  test('四类管道终局各有独立 code', () => {
    expect(GATEWAY_OWNER_FAILURE_CODES).toEqual([
      'gw-command-failed',
      'gateway-not-configured',
      'gateway-not-connected',
      'gateway-exited',
      'gateway-timeout',
    ]);
  });
});
