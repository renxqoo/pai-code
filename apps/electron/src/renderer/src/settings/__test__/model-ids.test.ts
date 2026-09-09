import { describe, expect, test } from "bun:test";

import type { ProviderModel } from "@paiapp/contracts";
import { toggleModelFlag } from "../model-ids";

const glm: ProviderModel = { id: "glm-4.6", reasoning: true, vision: false };

describe("模型条目纯函数", () => {
  test("切换能力位：命中项翻转，其余原样（含可选参数字段原样保留）", () => {
    const models: readonly ProviderModel[] = [
      { ...glm, contextWindow: 200000, maxTokens: 8192 },
      { id: "glm-5", reasoning: false, vision: true },
    ];
    expect(toggleModelFlag(models, "glm-4.6", "reasoning")).toEqual([
      { id: "glm-4.6", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
      { id: "glm-5", reasoning: false, vision: true },
    ]);
    expect(toggleModelFlag(models, "glm-5", "vision")).toEqual([
      { id: "glm-4.6", reasoning: true, vision: false, contextWindow: 200000, maxTokens: 8192 },
      { id: "glm-5", reasoning: false, vision: false },
    ]);
  });

  test("切换能力位：id 不存在时列表内容不变", () => {
    expect(toggleModelFlag([glm], "missing", "reasoning")).toEqual([glm]);
  });
});
