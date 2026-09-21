import { describe, expect, test } from "bun:test";

import {
  API_FORMAT_IDS,
  ApiFormatSchema,
  isApiFormat,
  normalizeLegacyApiFormat,
  parseSettings,
} from "../settings";

/** API 格式词表：顺序/封闭性与持久化宽松读的回归。 */
describe("API 格式词表", () => {
  test("导出词表与 schema 选项逐项一致且顺序稳定", () => {
    expect(API_FORMAT_IDS).toEqual([...ApiFormatSchema.options]);
    expect(API_FORMAT_IDS).toEqual([
      "anthropic",
      "openai",
    ]);
  });

  test("isApiFormat：词表内 true，其余（含旧词形与非词表协议）false", () => {
    for (const id of API_FORMAT_IDS) expect(isApiFormat(id)).toBe(true);
    for (const id of [
      "anthropic-messages",
      "openai-completions",
      "openai-responses",
      "google-generative-ai",
      "",
      "Anthropic",
    ]) {
      expect(isApiFormat(id)).toBe(false);
    }
  });

  test("磁盘上手写的非词表 api 不被判非法（不整表降级丢配置）", () => {
    const settings = parseSettings({
      providers: [
        {
          name: "custom",
          baseUrl: "https://x.example.com",
          api: "pi-messages",
          models: [{ id: "m", reasoning: false, vision: false }],
        },
      ],
    });
    expect(settings.providers).toHaveLength(1);
    expect(settings.providers[0]?.api).toBe("pi-messages");
  });
});

/** 旧协议词形读盘归一：anthropic-messages → anthropic、openai-completions/responses → openai。 */
describe("normalizeLegacyApiFormat 映射表", () => {
  test.each([
    ["anthropic-messages", "anthropic"],
    ["openai-completions", "openai"],
    ["openai-responses", "openai"],
    ["anthropic", "anthropic"],
    ["openai", "openai"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeLegacyApiFormat(input)).toBe(expected);
  });

  test("词表外语形原样保留（交 UI 回退显示，不虚构归一）", () => {
    for (const kept of ["pi-messages", "google-generative-ai", ""]) {
      expect(normalizeLegacyApiFormat(kept)).toBe(kept);
    }
  });
});

/** 模型参数字段：旧 settings（无 contextWindow/maxTokens）就地兼容，非法值拒绝。 */
describe("模型参数字段", () => {
  test("旧形态模型条目（无参数字段）解析通过，参数为 undefined", () => {
    const settings = parseSettings({
      providers: [
        {
          name: "glm",
          baseUrl: "https://x.example.com",
          api: "openai",
          models: [{ id: "m", reasoning: false, vision: false }],
        },
      ],
    });
    expect(settings.providers[0]?.models[0]?.contextWindow).toBeUndefined();
    expect(settings.providers[0]?.models[0]?.maxTokens).toBeUndefined();
  });

  test("正整数参数解析通过；零/负数/小数/非数值拒绝（整表降级缺省，不清空磁盘）", () => {
    const tuned = parseSettings({
      providers: [
        {
          name: "glm",
          baseUrl: "https://x.example.com",
          api: "openai",
          models: [
            { id: "m", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
          ],
        },
      ],
    });
    expect(tuned.providers[0]?.models[0]?.contextWindow).toBe(200000);
    expect(tuned.providers[0]?.models[0]?.maxTokens).toBe(8192);
    for (const bad of [0, -1, 1.5]) {
      const rejected = parseSettings({
        providers: [
          {
            name: "glm",
            baseUrl: "https://x.example.com",
            api: "openai",
            models: [{ id: "m", reasoning: false, vision: false, contextWindow: bad }],
          },
        ],
      });
      expect(rejected.providers).toHaveLength(0);
    }
  });
});

/** 数据迁移回归：旧盘 providers 带退役字段 thinkingFormat 与旧协议词形——就地归一而非整档降级清空渠道。 */
describe("退役字段数据迁移", () => {
  test("症状回归（渠道被清空）：thinkingFormat 剥离，providers/defaultModel 完整保留", () => {
    const legacy = {
      hubDev: { bunPath: null, hubEntry: null },
      providers: [
        { name: "GLM", baseUrl: "https://x.example.com", api: "openai-completions", thinkingFormat: "zai",
          models: [{ id: "glm-4.7", reasoning: true, vision: false }] },
      ],
      trustedDefault: true, defaultModel: "GLM/glm-4.7", onboarded: true,
      projectModels: {}, pinnedSessions: [], archivedSessions: [], hiddenProjects: [], idleRecycleMinutes: 5,
    };
    const settings = parseSettings(legacy);
    expect(settings.providers).toEqual([
      { name: "GLM", baseUrl: "https://x.example.com", api: "openai",
        models: [{ id: "glm-4.7", reasoning: true, vision: false }] },
    ]);
    expect(settings.defaultModel).toBe("GLM/glm-4.7");
  });

  test("混合迁移：string[] 模型升级、thinkingFormat 剥离与 api 旧词形归一同档生效", () => {
    const legacy = {
      providers: [
        { name: "p", baseUrl: "u", api: "anthropic-messages", thinkingFormat: "default", models: ["m"] },
      ],
    };
    const settings = parseSettings(legacy);
    expect(settings.providers[0]?.api).toBe("anthropic");
    expect(settings.providers[0]?.models).toEqual([{ id: "m", reasoning: false, vision: false }]);
  });

  test("api 旧词形归一逐项：openai 系与 anthropic 系旧词形读盘即归一到新词表", () => {
    const legacy = {
      providers: [
        { name: "a", baseUrl: "https://a.example.com", api: "anthropic-messages", models: [{ id: "m", reasoning: false, vision: false }] },
        { name: "b", baseUrl: "https://b.example.com", api: "openai-completions", models: [{ id: "m", reasoning: false, vision: false }] },
        { name: "c", baseUrl: "https://c.example.com", api: "openai-responses", models: [{ id: "m", reasoning: false, vision: false }] },
        { name: "d", baseUrl: "https://d.example.com", api: "openai", models: [{ id: "m", reasoning: false, vision: false }] },
      ],
    };
    const settings = parseSettings(legacy);
    expect(settings.providers.map((provider) => provider.api)).toEqual([
      "anthropic",
      "openai",
      "openai",
      "openai",
    ]);
  });
});
