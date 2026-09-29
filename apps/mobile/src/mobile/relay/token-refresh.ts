/**
 * 设备 token 换发（R2 M12）：relay POST /api/device-token/refresh——
 * 设备长期钥签名挑战应答（无需持有未过期 token；签名即所有权证明）。
 * 15min TTL 到期后的可持续续期；失败返回 null（调用方回落旧 token）。
 */
import { signBytes } from '@paiapp/relay-protocol';
import type { RelayCredentials } from './credentials';

export async function refreshDeviceToken(credentials: RelayCredentials): Promise<string | null> {
  const url = new URL(credentials.relayUrl.replace(/^ws/, 'http'));
  url.pathname = '/api/device-token/refresh';
  const nonce = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // nodeId 未知（relay 集群）——先用注册时缓存的；无缓存时经 /api/node-key 探测
  let nodeId = credentials.relayNodeId ?? "";
  if (nodeId.length === 0) {
    try {
      const probe = new URL(credentials.relayUrl.replace(/^ws/, 'http'));
      probe.pathname = '/api/node-key';
      const res = await fetch(probe.toString());
      if (res.ok) {
        const data = (await res.json()) as { nodeId?: string };
        nodeId = typeof data.nodeId === 'string' ? data.nodeId : '';
      }
    } catch {
      return null;
    }
  }
  const transcript = `device-refresh|${credentials.deviceId}|${nodeId}|${nonce}`;
  const sig = signBytes(credentials.signingSecret, new TextEncoder().encode(transcript));
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: credentials.deviceId, nonce, sig }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return typeof data.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}
