import { describe, expect, test } from "bun:test";

import type { ProviderModel } from "@paiapp/contracts";
import { buildProviderSubmit } from "../provider-editor";

/**
 * 提交校验纯函数：trim 归一、必填判定与 key 可选语义。
 * 模型条目（含 contextWindow/maxTokens 参数）由模型弹窗产出，这里原样透传。
 * 交互链路（弹窗增改模型、按钮触发 submit、清除 key 两步确认）依赖真机走查。
 */
const glm: ProviderModel = { id: "glm-4.6", reasoning: true, vision: false };

const base = {
  name: "zhihu",
  baseUrl: "https://api.z.ai/api/anthropic",
  api: "openai-completions",
  models: [] as ProviderModel[],
  apiKey: "",
} as const;

describe("渠道编辑器提交校验", () => {
  test("模型参数（contextWindow/maxTokens）随条目原样透传，不做二次归一", () => {
    const tuned: ProviderModel = { ...glm, contextWindow: 200000, maxTokens: 8192 };
    const result = buildProviderSubmit({ ...base, models: [tuned] });
    expect(result).toEqual({
      ok: true,
      input: {
        name: "zhihu",
        baseUrl: "https://api.z.ai/api/anthropic",
        api: "openai-completions",
        models: [tuned],
      },
    });
  });

  test("名称、地址与 API 格式前后空白 trim 后进提交载荷", () => {
    const result = buildProviderSubmit({
      ...base,
      name: " zhihu ",
      baseUrl: " https://api.z.ai ",
      api: " anthropic-messages ",
      models: [glm],
    });
    expect(result).toEqual({
      ok: true,
      input: {
        name: "zhihu",
        baseUrl: "https://api.z.ai",
        api: "anthropic-messages",
        models: [glm],
      },
    });
  });

  test("必填缺失：名称空、地址空白、API 格式空、模型清单空 → incomplete", () => {
    expect(buildProviderSubmit({ ...base, name: " ", models: [glm] })).toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(buildProviderSubmit({ ...base, baseUrl: " ", models: [glm] })).toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(buildProviderSubmit({ ...base, api: " ", models: [glm] })).toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(buildProviderSubmit({ ...base, models: [] })).toEqual({
      ok: false,
      reason: "incomplete",
    });
  });

  test("key 语义：留空省略字段（保持已存 key），有值则带上", () => {
    const kept = buildProviderSubmit({ ...base, models: [glm] });
    expect(kept.ok && "apiKey" in kept.input).toBe(false);
    const replaced = buildProviderSubmit({ ...base, models: [glm], apiKey: "sk-x" });
    expect(replaced.ok && replaced.input.apiKey).toBe("sk-x");
  });
});
