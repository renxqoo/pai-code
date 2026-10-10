import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';

/**
 * 症状回归（配对简化）：手机输完 6 位码后，比对码只经桌面 owner 自动确认——
 * 手机端不得再展示那 6 位数字（旧流程要人眼比对，留着是误导）。
 */

jest.mock('@/mobile/relay/runtime', () => {
  const state = { connects: 0 };
  return {
    __state: state,
    initializeRelayRuntime: () => ({ connectWithCredentials: () => { state.connects += 1; return Promise.resolve(); } }),
    useRelayStatus: () => ({ status: 'disconnected', runtime: null }),
  };
});

jest.mock('@/mobile/relay/credentials', () => ({
  relayCredentialsStore: {
    load: () => null,
    save: () => Promise.resolve(true),
    clear: () => Promise.resolve(),
  },
}));

jest.mock('@/mobile/relay/discover', () => ({
  discoverGateway: () => Promise.resolve({
    relayUrl: 'ws://127.0.0.1:8787',
    installationId: 'i-1',
    gatewayKeyFingerprint: 'fp-1',
    pairingId: 'p-1',
    pairingTicket: 'ticket-1',
  }),
}));

jest.mock('@/mobile/relay/ws-dial', () => ({
  dialWebSocket: () => {
    const socket = { onopen: null, onerror: null, onclose: null, onmessage: null, send: () => undefined, close: () => undefined } as unknown as Record<string, (() => void) | null>;
    setTimeout(() => socket['onopen']?.(), 0);
    return socket;
  },
}));

jest.mock('@/mobile/relay/qr-scan-modal', () => ({ QrScanModal: () => null }));

// 注册结果状态活在工厂内部（jest.mock 工厂不得引用外层变量）
jest.mock('@/mobile/relay/pairing', () => {
  const state = { registered: { ok: true, reason: 'timeout' } as { ok: boolean; reason: string } };
  return {
    __state: state,
    generateDeviceIdentity: () => ({ deviceId: 'd-1', signingSecret: 's', signingPub: 'p' }),
    createPairingSession: () => ({
      registeredDeviceId: 'd-1',
      relayToken: 'token-1',
      relayNodeId: null,
      onStep: (listener: (step: { phase: string; sas?: string }) => void) => {
        listener({ phase: 'sas-shown', sas: '392653' });
        return () => undefined;
      },
      startManual: () => Promise.resolve(),
      submitDeviceKeys: () => Promise.resolve(),
      waitRegistered: () => Promise.resolve(state.registered.ok ? { ok: true, sharedSecret: 'seed' } : { ok: false, reason: state.registered.reason }),
      close: () => undefined,
    }),
  };
});

import * as pairingModule from '@/mobile/relay/pairing';
import * as runtimeModule from '@/mobile/relay/runtime';
import { TestWrapper } from '@/test/test-wrapper';

import DevicesRoute from '../devices';

const pairingState = (pairingModule as unknown as { __state: { registered: { ok: boolean; reason: string } } }).__state;
const runtimeState = (runtimeModule as unknown as { __state: { connects: number } }).__state;

describe('devices route（症状回归：配对比对码不再要求人比对）', () => {
  beforeEach(() => {
    pairingState.registered = { ok: true, reason: 'timeout' };
    runtimeState.connects = 0;
  });

  it('输码配对走完后不渲染网关比对码', async () => {
    const view = await render(<TestWrapper><DevicesRoute /></TestWrapper>);
    await fireEvent.changeText(view.getByPlaceholderText('输入桌面端显示的 6 位配对码'), '246813');
    await fireEvent.press(view.getByText('输入 6 位码配对'));
    // 配对确实走完（凭证落库 → 正式连接），否则「没渲染比对码」只是因为流程没启动
    await waitFor(() => {
      expect(runtimeState.connects).toBe(1);
    });
    expect(view.queryByText('392653')).toBeNull();
    expect(view.queryByText('比对桌面端数字')).toBeNull();
    await view.unmount();
  });

  it('配对未完成的原因照旧上屏（错误面不被简化流程吞掉）', async () => {
    pairingState.registered = { ok: false, reason: 'owner_confirm_missing' };
    const view = await render(<TestWrapper><DevicesRoute /></TestWrapper>);
    await fireEvent.changeText(view.getByPlaceholderText('输入桌面端显示的 6 位配对码'), '246813');
    await fireEvent.press(view.getByText('输入 6 位码配对'));
    await waitFor(() => {
      expect(view.queryByText(/配对未完成/)).not.toBeNull();
    });
    await view.unmount();
  });
});
