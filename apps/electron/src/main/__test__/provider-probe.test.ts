import { expect, test } from 'bun:test';

import { createProviderProbe, type ProviderProbeDeps } from '../provider-probe';

/** 探活回归：错误映射表、URL 归一、同名单飞、全局并发上限。 */

type Responder = () => Response | Promise<Response>;

function makeHarness() {
  const calls: Array<{ url: string; body: unknown }> = [];
  const responders: Responder[] = [];
  const providers = new Map<string, { baseUrl: string; models: string[] }>([
    ['glm', { baseUrl: 'https://api.example.com/v1/', models: [{ id: 'glm-4.7', reasoning: true }] }],
    ['nokey', { baseUrl: 'https://api.example.com/v1', models: ['m'] }],
    ['weird', { baseUrl: 'https://api.example.com/v1/?x=1#frag', models: ['m'] }],
  ]);
  const keys = new Map<string, string>([['glm', 'sk-test'], ['weird', 'sk-test']]);
  const deps: ProviderProbeDeps = {
    getProvider: (name) => providers.get(name),
    getKey: (name) => keys.get(name) ?? null,
    timeoutSignal: () => new AbortController().signal,
    fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
      const urlText = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      calls.push({ url: urlText, body: bodyText.length > 0 ? (JSON.parse(bodyText) as unknown) : null });
      const respond = responders.shift();
      if (respond === undefined) return new Response('{}', { status: 200 });
      return respond();
    }) as typeof fetch,
  };
  return {
    calls,
    deps,
    respond: (responder: Responder) => responders.push(responder),
    addProvider: (name: string) => {
      providers.set(name, { baseUrl: `https://${name}.example.com`, models: ['m'] });
      keys.set(name, 'sk');
    },
  };
}

test('未知 provider → provider_not_found；缺 key → key_missing（不发请求）', async () => {
  const h = makeHarness();
  const probe = createProviderProbe(h.deps);
  expect(await probe.probe('ghost')).toEqual({ ok: false, reason: 'provider_not_found' });
  expect(await probe.probe('nokey')).toEqual({ ok: false, reason: 'key_missing' });
  expect(h.calls).toEqual([]);
});

test('200 → ok 且 latencyMs ≥ 0；URL 尾斜杠裁剪 + 1-token 请求体', async () => {
  const h = makeHarness();
  const outcome = await createProviderProbe(h.deps).probe('glm');
  expect(outcome.ok).toBe(true);
  if (outcome.ok) expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
  expect(h.calls[0]?.url).toBe('https://api.example.com/v1/chat/completions');
  expect(h.calls[0]?.body).toEqual({ model: 'glm-4.7', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] });
});

test.each([
  [401, 'http_401'],
  [500, 'http_500'],
])('HTTP %d → %s', async (status, reason) => {
  const h = makeHarness();
  h.respond(() => new Response('nope', { status }));
  expect(await createProviderProbe(h.deps).probe('glm')).toEqual({ ok: false, reason });
});

test('网络异常 → network_error；超时类异常 → timeout', async () => {
  const network = makeHarness();
  network.respond(() => {
    throw new Error('ECONNREFUSED');
  });
  expect(await createProviderProbe(network.deps).probe('glm')).toEqual({ ok: false, reason: 'network_error' });

  const timedOut = makeHarness();
  timedOut.respond(() => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    throw error;
  });
  expect(await createProviderProbe(timedOut.deps).probe('glm')).toEqual({ ok: false, reason: 'timeout' });
});

test('baseUrl 带 query/fragment：URL 归一去 fragment、保 query、拼对路径', async () => {
  const h = makeHarness();
  await createProviderProbe(h.deps).probe('weird');
  expect(h.calls[0]?.url).toBe('https://api.example.com/v1/chat/completions?x=1');
});

test('同 provider 单飞：并发两次只发一次请求', async () => {
  const h = makeHarness();
  let release: (() => void) | undefined;
  h.respond(
    () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(new Response('{}', { status: 200 }));
      }),
  );
  const probe = createProviderProbe(h.deps);
  const first = probe.probe('glm');
  const second = probe.probe('glm');
  release?.();
  const [a, b] = await Promise.all([first, second]);
  expect(a).toEqual(b);
  expect(h.calls.length).toBe(1);
});

test('全局在途上限 3：第 4 个不同 provider 直接 busy', async () => {
  const h = makeHarness();
  const releases: Array<() => void> = [];
  for (const name of ['a', 'b', 'c']) {
    h.addProvider(name);
    h.respond(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(new Response('{}', { status: 200 })));
        }),
    );
  }
  h.addProvider('d');
  const probe = createProviderProbe(h.deps);
  const pending = [probe.probe('a'), probe.probe('b'), probe.probe('c')];
  expect(await probe.probe('d')).toEqual({ ok: false, reason: 'busy' });
  for (const release of releases) release();
  const outcomes = await Promise.all(pending);
  expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
});
