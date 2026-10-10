/**
 * 症状：真机（Expo Go / dev build）输入正确 6 位码报「未找到配对码」。
 * 根因：候选主机只有 window.location.hostname（原生无 window.location）与 127.0.0.1
 * （手机自身）——探测请求根本到不了桌面端。dev 形态必须补 Metro 宿主
 * （Constants.expoConfig.hostUri / expoGoConfig.debuggerHost——真机即 Mac LAN IP）。
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Constants from 'expo-constants';

import { devHosts, discoverGateway, DISCOVER_PORT } from '../discover';

function installFetch(respond: (url: string) => { ok: boolean; json: () => Promise<unknown> } | null): jest.Mock {
  const mock = jest.fn((input: string | URL | Request) => {
    const reply = respond(input instanceof Request ? input.url : String(input));
    if (reply === null) return Promise.reject(new Error('network unreachable'));
    return Promise.resolve(reply as unknown as Response);
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

const gatewayHit = (): { ok: boolean; json: () => Promise<unknown> } => ({
  ok: true,
  json: () => Promise.resolve({ relayUrl: 'ws://lan-host:8787', installationId: 'i1', gatewayKeyFingerprint: 'g1', pairingId: 'p1', pairingTicket: 't1' }),
});

describe('dev 形态候选主机（症状：真机 6 位码必失败）', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    (Constants as { expoConfig: unknown }).expoConfig = null;
    (Constants as { expoGoConfig: unknown }).expoGoConfig = null;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Expo Go 真机：expoGoConfig.debuggerHost（host:port）成为候选——探测可达桌面 LAN IP', async () => {
    (Constants as { expoGoConfig: unknown }).expoGoConfig = { debuggerHost: '192.168.31.98:8081' };
    expect(devHosts()).toEqual(['192.168.31.98']);
    const mock = installFetch((url) => (url.includes('192.168.31.98') ? gatewayHit() : null));
    const hit = await discoverGateway('123456');
    expect(hit?.pairingId).toBe('p1');
    expect(mock.mock.calls.some(([input]) => String(input).includes(`http://192.168.31.98:${DISCOVER_PORT}/api/discover?code=123456`))).toBe(true);
  });

  it('dev build：expoConfig.hostUri 成为候选（无 debuggerHost 形态）', async () => {
    (Constants as { expoConfig: unknown }).expoConfig = { hostUri: '10.0.0.5:8081' };
    expect(devHosts()).toEqual(['10.0.0.5']);
    installFetch((url) => (url.includes('10.0.0.5') ? gatewayHit() : null));
    const hit = await discoverGateway('654321');
    expect(hit?.installationId).toBe('i1');
  });

  it('hostUri 与 debuggerHost 重复时去重；空串/带路径的畸形值被丢弃', () => {
    (Constants as { expoConfig: unknown }).expoConfig = { hostUri: '192.168.1.10:8081' };
    (Constants as { expoGoConfig: unknown }).expoGoConfig = { debuggerHost: '192.168.1.10:8081' };
    expect(devHosts()).toEqual(['192.168.1.10']);
    (Constants as { expoConfig: unknown }).expoConfig = { hostUri: '  ' };
    (Constants as { expoGoConfig: unknown }).expoGoConfig = { debuggerHost: 'http://x/y' };
    expect(devHosts()).toEqual([]);
  });

  it('打包形态（无 dev 宿主）：全部候选失联时诚实返回 null——报「未找到配对码」', async () => {
    installFetch(() => null);
    await expect(discoverGateway('999999')).resolves.toBeNull();
  });
});
