import { expect, test } from "bun:test";

import { serializeProvidersConfig } from "../providers-config";
import type { ProviderConfig } from "@paiapp/contracts";

/**
 * providers.json 序列化回归（x-harness 档案形状 {providers:[{name,protocol,
 * baseUrl,apiKeyEnv,models:[...]}]}）：模型级 reasoning/input **显式写**
 * （x-harness 缺省 reasoning=true、缺 input 拒图——省略即语义翻转）；key 只以
 * apiKeyEnv 的 env 引用（不落文件）。落盘/fs 用例在 apps/electron
 * models-config.test.ts。
 */

const provider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  name: "glm",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  api: "openai",
  models: [{ id: "glm-5.3-flash", reasoning: true, vision: false }],
  ...overrides,
});

type Profile = {
  name: string;
  protocol: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: Array<Record<string, unknown>>;
};

test("症状回归：vision:false 不写 input（hub 能力门拒图——声明面如实），reasoning:false 显式写 false", () => {
  const file = JSON.parse(serializeProvidersConfig([provider({ models: [{ id: "m", reasoning: false, vision: false }] })])) as {
    providers: Profile[];
  };
  expect(file.providers[0]?.models).toEqual([{ id: "m", reasoning: false }]);
});

test("多渠道档案并列；env 变量名按渠道名 sanitize；协议字段透传（anthropic/openai）", () => {
  const file = JSON.parse(
    serializeProvidersConfig([
      provider(),
      provider({ name: "zai-glm", api: "anthropic", baseUrl: "https://z.ai/api", models: [{ id: "glm-5", reasoning: false, vision: false }] }),
    ]),
  ) as { providers: Profile[] };
  expect(file.providers.map((profile) => profile.name)).toEqual(["glm", "zai-glm"]);
  expect(file.providers.map((profile) => profile.apiKeyEnv)).toEqual(["PAI_KEY_GLM", "PAI_KEY_ZAI_GLM"]);
  expect(file.providers.map((profile) => profile.protocol)).toEqual(["openai", "anthropic"]);
});

test("模型参数：contextWindow/maxTokens 声明则落模型定义，缺省不写字段（回落 hub 缺省）", () => {
  const file = JSON.parse(
    serializeProvidersConfig([
      provider({
        models: [
          { id: "tuned", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
          { id: "defaulted", reasoning: false, vision: false },
          { id: "half", reasoning: false, vision: false, maxTokens: 4096 },
        ],
      }),
    ]),
  ) as { providers: Profile[] };
  expect(file.providers[0]?.models).toEqual([
    { id: "tuned", reasoning: false, contextWindow: 200000, maxTokens: 8192 },
    { id: "defaulted", reasoning: false },
    { id: "half", reasoning: false, maxTokens: 4096 },
  ]);
});
