/**
 * provider 连接探活：主进程直发 OpenAI 兼容 1-token 请求。
 * 不经 hub、不落任何状态；key 只从 keyStore 取，不进日志与错误信息。
 * 并发预算：同 provider 单飞（复用在途 Promise）；全局在途上限 3，超出直接 busy；单次 10s 超时。
 */

export type ProbeOutcome = { ok: true; latencyMs: number } | { ok: false; reason: string };

export interface ProviderProbeDeps {
  getProvider(name: string): { baseUrl: string; models: readonly string[] } | undefined;
  getKey(name: string): string | null;
  /** 注入点：测试替身用；缺省全局 fetch。 */
  fetchFn?: typeof fetch;
  /** 注入点：测试替身用；缺省 AbortSignal.timeout。 */
  timeoutSignal?: (ms: number) => AbortSignal;
}

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_CONCURRENT = 3;
const defaultTimeoutSignal = (ms: number): AbortSignal => AbortSignal.timeout(ms);

export function createProviderProbe(deps: ProviderProbeDeps) {
  const inflight = new Map<string, Promise<ProbeOutcome>>();
  let activeCount = 0;

  const run = async (name: string): Promise<ProbeOutcome> => {
    const provider = deps.getProvider(name);
    if (provider === undefined) return { ok: false, reason: 'provider_not_found' };
    if (provider.models.length === 0) return { ok: false, reason: 'no_models' };
    const key = deps.getKey(name);
    if (key === null) return { ok: false, reason: 'key_missing' };
    if (activeCount >= PROBE_MAX_CONCURRENT) return { ok: false, reason: 'busy' };

    activeCount += 1;
    const startedAt = Date.now();
    try {
      // URL 对象归一：容忍尾斜杠/query，防 baseUrl 带 ?/# 拼出畸形地址打到错误端点
      const target = new URL(provider.baseUrl);
      target.hash = '';
      target.pathname = `${target.pathname.replace(/\/+$/, '')}/chat/completions`;
      const response = await (deps.fetchFn ?? fetch)(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: provider.models[0], max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        signal: (deps.timeoutSignal ?? defaultTimeoutSignal)(PROBE_TIMEOUT_MS),
      });
      // 成败两路径都排空响应体，避免错误响应占住连接池 socket
      await response.arrayBuffer().catch(() => undefined);
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const errorName = error instanceof Error ? error.name : '';
      if (errorName === 'TimeoutError' || errorName === 'AbortError') return { ok: false, reason: 'timeout' };
      return { ok: false, reason: 'network_error' };
    } finally {
      activeCount -= 1;
    }
  };

  return {
    probe(name: string): Promise<ProbeOutcome> {
      const existing = inflight.get(name);
      if (existing !== undefined) return existing;
      const pending = run(name).finally(() => {
        inflight.delete(name);
      });
      inflight.set(name, pending);
      return pending;
    },
  };
}
