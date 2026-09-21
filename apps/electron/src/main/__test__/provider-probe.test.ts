import { expect, test } from "bun:test";

import {
  buildProbeRequest,
  createProviderProbe,
  supportsProbe,
  type ProviderProbeDeps,
} from "../provider-probe";

/** 探活回归：错误映射表、按 API 格式构造请求、URL 归一、同名单飞、全局并发上限。 */

type Responder = () => Response | Promise<Response>;

function makeHarness() {
  const calls: Array<{ url: string; body: unknown }> = [];
  const responders: Responder[] = [];
  const providers = new Map<string, { baseUrl: string; api: string; models: { id: string }[] }>([
    [
      "glm",
      {
        baseUrl: "https://api.example.com/v1/",
        api: "openai",
        models: [{ id: "glm-4.7" }],
      },
    ],
    [
      "multi",
      {
        baseUrl: "https://api.example.com/v1",
        api: "openai",
        models: [{ id: "first-m" }, { id: "second-m" }],
      },
    ],
    [
      "nokey",
      { baseUrl: "https://api.example.com/v1", api: "openai", models: [{ id: "m" }] },
    ],
    [
      "weird",
      {
        baseUrl: "https://api.example.com/v1/?x=1#frag",
        api: "openai",
        models: [{ id: "m" }],
      },
    ],
    ["nomodels", { baseUrl: "https://api.example.com/v1", api: "openai", models: [] }],
    [
      "private",
      { baseUrl: "https://api.example.com/v1", api: "pi-messages", models: [{ id: "m" }] },
    ],
  ]);
  const keys = new Map<string, string>([
    ["glm", "sk-test"],
    ["multi", "sk-test"],
    ["weird", "sk-test"],
    ["nomodels", "sk-test"],
    ["private", "sk-test"],
  ]);
  const deps: ProviderProbeDeps = {
    getProvider: (name) => providers.get(name),
    getKey: (name) => keys.get(name) ?? null,
    timeoutSignal: () => new AbortController().signal,
    fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
      const urlText = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      const bodyText = typeof init?.body === "string" ? init.body : "";
      calls.push({
        url: urlText,
        body: bodyText.length > 0 ? (JSON.parse(bodyText) as unknown) : null,
      });
      const respond = responders.shift();
      if (respond === undefined) return new Response("{}", { status: 200 });
      return respond();
    }) as typeof fetch,
  };
  return {
    calls,
    deps,
    respond: (responder: Responder) => responders.push(responder),
    addProvider: (name: string) => {
      providers.set(name, {
        baseUrl: `https://${name}.example.com`,
        api: "openai",
        models: [{ id: "m" }],
      });
      keys.set(name, "sk");
    },
  };
}

test("未知 provider → provider_not_found；缺 key → key_missing；空模型 → no_models（不发请求）", async () => {
  const h = makeHarness();
  const probe = createProviderProbe(h.deps);
  expect(await probe.probe("ghost")).toEqual({ ok: false, reason: "provider_not_found" });
  expect(await probe.probe("nokey")).toEqual({ ok: false, reason: "key_missing" });
  expect(await probe.probe("nomodels")).toEqual({ ok: false, reason: "no_models" });
  expect(h.calls).toEqual([]);
});

test("非词表 API 格式 → unsupported_api（不发请求，不假装连通）", async () => {
  const h = makeHarness();
  expect(await createProviderProbe(h.deps).probe("private")).toEqual({
    ok: false,
    reason: "unsupported_api",
  });
  expect(h.calls).toEqual([]);
  expect(supportsProbe("pi-messages")).toBe(false);
  // 历史词形（读盘归一前的存量值与退役格式）全部不可探
  for (const api of [
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
    "google-generative-ai",
    "mistral-conversations",
  ]) {
    expect(supportsProbe(api)).toBe(false);
  }
  for (const api of ["openai", "anthropic"]) {
    expect(supportsProbe(api)).toBe(true);
  }
});

test.each([
  [
    "openai",
    "https://api.example.com/v1",
    "https://api.example.com/v1/chat/completions",
    { authorization: "Bearer sk-test", "content-type": "application/json" },
    { model: "glm-4.7", max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
  ],
  [
    "anthropic",
    "https://api.example.com",
    "https://api.example.com/messages",
    {
      "x-api-key": "sk-test",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    { model: "glm-4.7", max_tokens: 1, messages: [{ role: "user", content: "ping" }] },
  ],
])("buildProbeRequest %s：路径/鉴权/请求体按协议取值", (api: string, baseUrl: string, url: string, headers: Record<string, string>, body: unknown) => {
  const request = buildProbeRequest({ baseUrl, api, modelId: "glm-4.7", apiKey: "sk-test" });
  expect(request).not.toBeNull();
  expect(request?.url.href).toBe(url);
  expect(request?.headers).toEqual(headers);
  expect(JSON.parse(request?.body ?? "")).toEqual(body);
});

test("buildProbeRequest：非词表格式返回 null（历史词形与私有格式均不可探）", () => {
  for (const api of ["pi-messages", "google-generative-ai", "openai-responses"]) {
    expect(
      buildProbeRequest({
        baseUrl: "https://x.example.com",
        api,
        modelId: "m",
        apiKey: "k",
      }),
    ).toBeNull();
  }
});

test("200 → ok 且 latencyMs ≥ 0；URL 尾斜杠裁剪 + 1-token 请求体", async () => {
  const h = makeHarness();
  const outcome = await createProviderProbe(h.deps).probe("glm");
  expect(outcome.ok).toBe(true);
  if (outcome.ok) expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
  expect(h.calls[0]?.url).toBe("https://api.example.com/v1/chat/completions");
  expect(h.calls[0]?.body).toEqual({
    model: "glm-4.7",
    max_tokens: 1,
    messages: [{ role: "user", content: "ping" }],
  });
});

test("指定模型探活：modelId 进请求体；缺省仍探第一个模型", async () => {
  const h = makeHarness();
  const probe = createProviderProbe(h.deps);
  expect((await probe.probe("multi", "second-m")).ok).toBe(true);
  expect((await probe.probe("multi")).ok).toBe(true);
  const probedModels = h.calls.map((call) => (call.body as { model?: string }).model);
  expect(probedModels[0]).toBe("second-m");
  expect(probedModels[1]).toBe("first-m");
});

test("指定模型不在渠道模型清单 → model_not_in_channel（不发请求；编辑页未保存模型的口径）", async () => {
  const h = makeHarness();
  expect(await createProviderProbe(h.deps).probe("multi", "unsaved-m")).toEqual({
    ok: false,
    reason: "model_not_in_channel",
  });
  expect(h.calls).toEqual([]);
});

test("同 provider 不同模型不共享单飞（并发各发一次）；同 provider 同模型仍单飞", async () => {
  const h = makeHarness();
  const releases: Array<() => void> = [];
  for (let i = 0; i < 2; i += 1) {
    h.respond(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(new Response("{}", { status: 200 })));
        }),
    );
  }
  const probe = createProviderProbe(h.deps);
  const pending = [
    probe.probe("multi", "first-m"),
    probe.probe("multi", "second-m"),
    probe.probe("multi", "first-m"),
  ];
  for (const release of releases) release();
  const outcomes = await Promise.all(pending);
  expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  // 三次调用、两个不同模型 → 只发两个请求（同模型第三次复用在途）
  expect(h.calls.length).toBe(2);
  expect(new Set(h.calls.map((call) => (call.body as { model?: string }).model))).toEqual(
    new Set(["first-m", "second-m"]),
  );
});

test.each([
  [401, "http_401"],
  [500, "http_500"],
])("HTTP %d → %s", async (status: number, reason: string) => {
  const h = makeHarness();
  h.respond(() => new Response("nope", { status }));
  expect(await createProviderProbe(h.deps).probe("glm")).toEqual({ ok: false, reason });
});

test("网络异常 → network_error；超时类异常 → timeout", async () => {
  const network = makeHarness();
  network.respond(() => {
    throw new Error("ECONNREFUSED");
  });
  expect(await createProviderProbe(network.deps).probe("glm")).toEqual({
    ok: false,
    reason: "network_error",
  });

  const timedOut = makeHarness();
  timedOut.respond(() => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });
  expect(await createProviderProbe(timedOut.deps).probe("glm")).toEqual({
    ok: false,
    reason: "timeout",
  });
});

test("baseUrl 带 query/fragment：URL 归一去 fragment、保 query、拼对路径", async () => {
  const h = makeHarness();
  await createProviderProbe(h.deps).probe("weird");
  expect(h.calls[0]?.url).toBe("https://api.example.com/v1/chat/completions?x=1");
});

test("响应体读取失败（连接被重置）：只影响排空，不改变探活结果", async () => {
  const h = makeHarness();
  const response = new Response("{}", { status: 200 });
  Object.defineProperty(response, "arrayBuffer", {
    value: (): Promise<ArrayBuffer> => Promise.reject(new Error("ECONNRESET")),
  });
  h.respond(() => response);
  expect((await createProviderProbe(h.deps).probe("glm")).ok).toBe(true);
});

test("未注入 timeoutSignal 时用 AbortSignal.timeout 作为缺省超时信号（真机路径）", async () => {
  const h = makeHarness();
  let signal: AbortSignal | null = null;
  const deps: ProviderProbeDeps = {
    getProvider: (name) => h.deps.getProvider(name),
    getKey: (name) => h.deps.getKey(name),
    fetchFn: ((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? null;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch,
  };
  expect((await createProviderProbe(deps).probe("glm")).ok).toBe(true);
  expect(signal).toBeInstanceOf(AbortSignal);
});

test("同 provider 单飞：并发两次只发一次请求", async () => {
  const h = makeHarness();
  let release: (() => void) | undefined;
  h.respond(
    () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(new Response("{}", { status: 200 }));
      }),
  );
  const probe = createProviderProbe(h.deps);
  const first = probe.probe("glm");
  const second = probe.probe("glm");
  release?.();
  const [a, b] = await Promise.all([first, second]);
  expect(a).toEqual(b);
  expect(h.calls.length).toBe(1);
});

test("全局在途上限 3：第 4 个不同 provider 直接 busy", async () => {
  const h = makeHarness();
  const releases: Array<() => void> = [];
  for (const name of ["a", "b", "c"]) {
    h.addProvider(name);
    h.respond(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() => resolve(new Response("{}", { status: 200 })));
        }),
    );
  }
  h.addProvider("d");
  const probe = createProviderProbe(h.deps);
  const pending = [probe.probe("a"), probe.probe("b"), probe.probe("c")];
  expect(await probe.probe("d")).toEqual({ ok: false, reason: "busy" });
  for (const release of releases) release();
  const outcomes = await Promise.all(pending);
  expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
});
