import { describe, expect, test } from "bun:test";

import { API_FORMAT_IDS, ApiFormatSchema, isApiFormat, parseSettings } from "../settings";

/** API 格式词表：顺序/封闭性与持久化宽松读的回归。 */
describe("API 格式词表", () => {
  test("导出词表与 schema 选项逐项一致且顺序稳定", () => {
    expect(API_FORMAT_IDS).toEqual([...ApiFormatSchema.options]);
    expect(API_FORMAT_IDS).toEqual([
      "openai-completions",
      "openai-responses",
      "anthropic-messages",
      "google-generative-ai",
      "mistral-conversations",
    ]);
  });

  test("isApiFormat：词表内 true，其余（含需特殊鉴权的格式）false", () => {
    for (const id of API_FORMAT_IDS) expect(isApiFormat(id)).toBe(true);
    for (const id of [
      "pi-messages",
      "azure-openai-responses",
      "bedrock-converse-stream",
      "google-vertex",
      "openai-codex-responses",
      "",
      "OpenAI-Completions",
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
          thinkingFormat: "default",
        },
      ],
    });
    expect(settings.providers).toHaveLength(1);
    expect(settings.providers[0]?.api).toBe("pi-messages");
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
          api: "openai-completions",
          models: [{ id: "m", reasoning: false, vision: false }],
          thinkingFormat: "default",
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
          api: "openai-completions",
          models: [
            { id: "m", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
          ],
          thinkingFormat: "default",
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
            api: "openai-completions",
            models: [{ id: "m", reasoning: false, vision: false, contextWindow: bad }],
            thinkingFormat: "default",
          },
        ],
      });
      expect(rejected.providers).toHaveLength(0);
    }
  });
});
