/**
 * provider 连接探活：主进程按渠道的 API 格式直发最小请求（1 token / ping 文本）。
 * 不经 hub、不落任何状态；key 只从 keyStore 取，只出现在请求头或 query，不进日志与错误信息。
 * 并发预算：同 provider 单飞（复用在途 Promise）；全局在途上限 3，超出直接 busy；单次 10s 超时。
 */

export type ProbeOutcome = { ok: true; latencyMs: number } | { ok: false; reason: string };

export interface ProviderProbeDeps {
  getProvider(name: string): { baseUrl: string; api: string; models: readonly { id: string }[] } | undefined;
  getKey(name: string): string | null;
  /** 注入点：测试替身用；缺省全局 fetch。 */
  fetchFn?: typeof fetch;
  /** 注入点：测试替身用；缺省 AbortSignal.timeout。 */
  timeoutSignal?: (ms: number) => AbortSignal;
}

export type ProbeRequest = { url: URL; headers: Record<string, string>; body: string };

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_CONCURRENT = 3;
const defaultTimeoutSignal = (ms: number): AbortSignal => AbortSignal.timeout(ms);

/**
 * 各格式的探活描述（单一真相：支持的格式 = 表里的键；请求体/端点/鉴权都由此派生）。
 * 只求服务端接受并回 2xx，所以请求体取各协议的最小合法形状。
 */
type ProbeSpec = {
  body: (modelId: string) => string
  path: (basePath: string, modelId: string) => string
  headers: (apiKey: string) => Record<string, string>
  /** 鉴权走 query 的格式（google）；其余格式用 headers。 */
  query?: (apiKey: string) => Record<string, string>
};

const chatBody = (modelId: string): string => JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] });
const bearer = (apiKey: string): Record<string, string> => ({ authorization: `Bearer ${apiKey}` });

const PROBE_SPECS: Readonly<Record<string, ProbeSpec>> = {
  'openai-completions': { body: chatBody, path: (base) => `${base}/chat/completions`, headers: bearer },
  'mistral-conversations': { body: chatBody, path: (base) => `${base}/chat/completions`, headers: bearer },
  'openai-responses': {
    body: (modelId) => JSON.stringify({ model: modelId, input: 'ping', max_output_tokens: 16 }),
    path: (base) => `${base}/responses`,
    headers: bearer,
  },
  'anthropic-messages': {
    body: chatBody,
    path: (base) => `${base}/messages`,
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
  },
  'google-generative-ai': {
    body: () => JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
    // 官方文档的模型 id 常带 `models/` 前缀，路径已含 /models/：去前缀，避免 /models/models%2F…
    path: (base, modelId) => `${base}/models/${encodeURIComponent(modelId.replace(/^models\//, ''))}:generateContent`,
    headers: () => ({}),
    query: (apiKey) => ({ key: apiKey }),
  },
};

/** 该格式是否支持探活（需特殊鉴权或私有协议的格式不在表里）。 */
export function supportsProbe(api: string): boolean {
  return PROBE_SPECS[api] !== undefined;
}

/**
 * 按 API 格式构造探活请求（纯函数，便于表驱动断言）。
 * URL 归一：去 fragment、去尾斜杠后拼端点路径，保留 baseUrl 既有 query（google 的 key 覆盖同名参数）。
 * 返回 null = 该格式不支持探活，调用方映射 unsupported_api。
 */
export function buildProbeRequest(input: { baseUrl: string; api: string; modelId: string; apiKey: string }): ProbeRequest | null {
  const spec: ProbeSpec | undefined = PROBE_SPECS[input.api];
  if (spec === undefined) return null;
  const url = new URL(input.baseUrl);
  url.hash = '';
  url.pathname = spec.path(url.pathname.replace(/\/+$/, ''), input.modelId);
  for (const [name, value] of Object.entries(spec.query?.(input.apiKey) ?? {})) url.searchParams.set(name, value);
  return {
    url,
    headers: { 'content-type': 'application/json', ...spec.headers(input.apiKey) },
    body: spec.body(input.modelId),
  };
}

export function createProviderProbe(deps: ProviderProbeDeps) {
  const inflight = new Map<string, Promise<ProbeOutcome>>();
  let activeCount = 0;

  const run = async (name: string): Promise<ProbeOutcome> => {
    const provider = deps.getProvider(name);
    if (provider === undefined) return { ok: false, reason: 'provider_not_found' };
    if (provider.models.length === 0) return { ok: false, reason: 'no_models' };
    if (!supportsProbe(provider.api)) return { ok: false, reason: 'unsupported_api' };
    const key = deps.getKey(name);
    if (key === null) return { ok: false, reason: 'key_missing' };
    if (activeCount >= PROBE_MAX_CONCURRENT) return { ok: false, reason: 'busy' };

    const target = buildProbeRequest({ baseUrl: provider.baseUrl, api: provider.api, modelId: provider.models[0]?.id ?? '', apiKey: key });
    if (target === null) return { ok: false, reason: 'unsupported_api' };

    activeCount += 1;
    const startedAt = Date.now();
    try {
      const response = await (deps.fetchFn ?? fetch)(target.url, {
        method: 'POST',
        headers: target.headers,
        body: target.body,
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
