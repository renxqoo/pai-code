import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeModelsConfig, serializeModelsConfig, modelsConfigDiffers } from "../models-config";
import type { ProviderConfig } from "@paiapp/contracts";
import type { ProviderKeyStore } from "../file-settings";

/**
 * models.json 生成回归（host-hub 扁平形状 {models:[{id,provider,api,baseUrl,apiKeyEnv,...}]}）：
 * 模型条目缺 reasoning 时 pi 侧思考档只有 Off（症状：会话思考不可选）；缺 vision 声明时
 * hub 按纯文本模型处理（症状：多模态模型收不到图片，发送时被剥成占位文本）——能力声明
 * 必须完整落进生成文件；key 只以 apiKeyEnv 的 env 引用注入，不落文件。
 */

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pai-models-config-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const memoryKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: (name) => (name === "glm" ? "sk-secret" : null),
  setKey: () => undefined,
  keyNames: ["glm"],
};

const provider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  name: "glm",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  api: "openai-completions",
  models: [{ id: "glm-5.3-flash", reasoning: true, vision: false }],
  ...overrides,
});

test('症状回归：reasoning 模型生成 reasoning:true；vision 模型生成 input:["text","image"]；key 只以 apiKeyEnv 引用', () => {
  const dir = tempDir();
  const { env } = writeModelsConfig(
    dir,
    [provider({ models: [{ id: "glm-5.3-flash", reasoning: true, vision: true }] })],
    memoryKeyStore,
  );
  const file = JSON.parse(readFileSync(join(dir, "models.json"), "utf8")) as {
    models: Array<{ id: string; provider: string; api: string; baseUrl: string; apiKeyEnv: string; reasoning?: boolean; input?: string[] }>;
  };
  expect(file.models).toEqual([
    {
      id: "glm-5.3-flash",
      provider: "glm",
      api: "openai-completions",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKeyEnv: "PAI_KEY_GLM",
      reasoning: true,
      input: ["text", "image"],
    },
  ]);
  expect(env).toEqual({ PAI_KEY_GLM: "sk-secret" });
});

test('症状回归：未声明 vision 的多模态模型图片被剥（hub 侧 input 缺省纯文本）——vision:false 不写 input 字段', () => {
  const file = JSON.parse(serializeModelsConfig([provider()])) as {
    models: Array<{ id: string; input?: string[] }>;
  };
  expect(file.models).toEqual([
    { id: "glm-5.3-flash", provider: "glm", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "PAI_KEY_GLM", reasoning: true },
  ]);
});

test("多渠道扁平并列（同一文件 models[] 内按渠道顺序展开）；env 变量名按渠道名 sanitize", () => {
  const file = JSON.parse(
    serializeModelsConfig([
      provider(),
      provider({ name: "zai-glm", api: "anthropic-messages", baseUrl: "https://z.ai/api", models: [{ id: "glm-5", reasoning: false, vision: false }] }),
    ]),
  ) as { models: Array<{ id: string; provider: string; apiKeyEnv: string }> };
  expect(file.models.map((model) => model.provider)).toEqual(["glm", "zai-glm"]);
  expect(file.models.map((model) => model.apiKeyEnv)).toEqual(["PAI_KEY_GLM", "PAI_KEY_ZAI_GLM"]);
});

test("模型参数：contextWindow/maxTokens 声明则落模型定义，缺省不写字段（回落 hub 缺省）", () => {
  const file = JSON.parse(
    serializeModelsConfig([
      provider({
        models: [
          { id: "tuned", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
          { id: "defaulted", reasoning: false, vision: false },
          { id: "half", reasoning: false, vision: false, maxTokens: 4096 },
        ],
      }),
    ]),
  ) as { models: Array<{ id: string; contextWindow?: number; maxTokens?: number }> };
  expect(file.models).toEqual([
    { id: "tuned", provider: "glm", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "PAI_KEY_GLM", contextWindow: 200000, maxTokens: 8192 },
    { id: "defaulted", provider: "glm", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "PAI_KEY_GLM" },
    { id: "half", provider: "glm", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "PAI_KEY_GLM", maxTokens: 4096 },
  ]);
});

test("reasoning:false 形态不写多余字段（生成面最小化）", () => {
  const dir = tempDir();
  writeModelsConfig(
    dir,
    [
      provider({
        models: [{ id: "m", reasoning: false, vision: false }],
      }),
    ],
    memoryKeyStore,
  );
  const file = JSON.parse(readFileSync(join(dir, "models.json"), "utf8")) as { models: Array<Record<string, unknown>> };
  expect(file.models).toEqual([
    { id: "m", provider: "glm", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "PAI_KEY_GLM" },
  ]);
});

test("modelsConfigDiffers：能力/参数/端点变更与文件缺失都判需重载；一致时判无需", () => {
  const dir = tempDir();
  mkdirSync(dir, { recursive: true });
  // 缺文件 → 需要
  expect(modelsConfigDiffers(dir, [provider()])).toBe(true);
  writeModelsConfig(dir, [provider()], memoryKeyStore);
  // 与磁盘一致 → 不需要
  expect(modelsConfigDiffers(dir, [provider()])).toBe(false);
  // 仅 reasoning 变化（provider 名与模型 id 不变）→ 需要（旧判定按名集合会漏）
  expect(
    modelsConfigDiffers(dir, [
      provider({ models: [{ id: "glm-5.3-flash", reasoning: false, vision: false }] }),
    ]),
  ).toBe(true);
  // 仅 vision 变化（多模态声明补开）→ 需要
  expect(
    modelsConfigDiffers(dir, [
      provider({ models: [{ id: "glm-5.3-flash", reasoning: true, vision: true }] }),
    ]),
  ).toBe(true);
  // 端点/格式变化 → 需要（hub 拨号面随之变）
  expect(modelsConfigDiffers(dir, [provider({ baseUrl: "https://other.example.com" })])).toBe(true);
  // 仅模型参数（contextWindow/maxTokens）变化 → 需要（compaction 阈值/输出上限随之变）
  expect(
    modelsConfigDiffers(dir, [
      provider({
        models: [{ id: "glm-5.3-flash", reasoning: true, vision: false, contextWindow: 200000 }],
      }),
    ]),
  ).toBe(true);
  // 序列化稳定可作对比基准
  expect(serializeModelsConfig([provider()])).toBe(readFileSync(join(dir, "models.json"), "utf8"));
});

test("models.json 读取失败（同路径是目录）：判需重载而不是抛错阻断设置页", () => {
  const dir = tempDir();
  mkdirSync(join(dir, "models.json"));
  expect(modelsConfigDiffers(dir, [provider()])).toBe(true);
});
