/**
 * 6 位配对码网关发现：同网段/同机探测 relay 的 /api/discover?code=xxxxxx。
 * 候选源：本机固定端口（web 预览与 gateway 同机）、QR 扫描记录的 relay 主机、
 * 常见网关地址。命中即返回 {relayUrl, installationId, gatewayKeyFingerprint,
 * pairingId}——手机侧免填任何地址。
 */
export interface DiscoveredGateway {
  relayUrl: string;
  installationId: string;
  gatewayKeyFingerprint: string;
  pairingId: string;
  pairingTicket: string;
}

export const DISCOVER_PORT = 8787;

function candidates(): string[] {
  const out: string[] = [];
  if (typeof window === 'object' && window !== null && typeof window.location === 'object' && window.location !== null) {
    const host = window.location.hostname;
    if (typeof host === 'string' && host.length > 0) out.push(host);
  }
  out.push('127.0.0.1');
  return [...new Set(out)];
}

async function probe(origin: string, code: string, timeoutMs: number): Promise<DiscoveredGateway | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${origin}/api/discover?code=${encodeURIComponent(code)}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DiscoveredGateway>;
    if (
      typeof data.relayUrl === 'string' && data.relayUrl.length > 0 &&
      typeof data.installationId === 'string' && data.installationId.length > 0 &&
      typeof data.gatewayKeyFingerprint === 'string' && data.gatewayKeyFingerprint.length > 0 &&
      typeof data.pairingId === 'string' && data.pairingId.length > 0
    ) {
      return { relayUrl: data.relayUrl, installationId: data.installationId, gatewayKeyFingerprint: data.gatewayKeyFingerprint, pairingId: data.pairingId, pairingTicket: typeof data.pairingTicket === 'string' ? data.pairingTicket : '' };
    }
    return null;
  } catch {
    return null;
  }
}

/** 按码发现网关（并发探测全部候选，任一命中即返回）。 */
export async function discoverGateway(code: string): Promise<DiscoveredGateway | null> {
  const digits = code.replace(/[^0-9]/g, '');
  if (digits.length !== 6) return null;
  const hosts = candidates();
  const results = await Promise.all(hosts.map((host) => probe(`http://${host}:${DISCOVER_PORT}`, digits, 2_500)));
  return results.find((hit) => hit !== null) ?? null;
}
