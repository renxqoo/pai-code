import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { modelsConfigDiffers, writeModelsConfig } from "../models-config";
import { serializeProvidersConfig } from "@paiapp/api";
import type { ProviderConfig } from "@paiapp/contracts";
import type { ProviderKeyStore } from "../file-settings";

/**
 * providers.json 生成回归（x-harness 档案形状 {providers:[{name,protocol,baseUrl,
 * apiKeyEnv,models:[...]}]}）：模型级 reasoning/input **显式写**（x-harness 缺省
 * reasoning=true、缺 input 拒图——省略即语义翻转）；key 只以 apiKeyEnv 的 env
 * 引用注入，不落文件；旧 models.json 孤儿随写清扫。
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

const readProfiles = (dir: string): Profile[] =>
  (JSON.parse(readFileSync(join(dir, "providers.json"), "utf8")) as { providers: Profile[] }).providers;

test('症状回归：vision 模型显式写 input:["text","image"]；reasoning 恒显式布尔；key 只以 apiKeyEnv 引用', () => {
  const dir = tempDir();
  const { env } = writeModelsConfig(
    dir,
    [provider({ models: [{ id: "glm-5.3-flash", reasoning: true, vision: true }] })],
    memoryKeyStore,
  );
  const [profile] = readProfiles(dir);
  expect(profile).toEqual({
    name: "glm",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyEnv: "PAI_KEY_GLM",
    models: [{ id: "glm-5.3-flash", reasoning: true, input: ["text", "image"] }],
  });
  expect(env).toEqual({ PAI_KEY_GLM: "sk-secret" });
});

test("旧 models.json 孤儿随写清扫（x-harness 只认 providers.json，残留徒增排障噪音）", () => {
  const dir = tempDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "models.json"), "{}");
  writeModelsConfig(dir, [provider()], memoryKeyStore);
  expect(existsSync(join(dir, "models.json"))).toBe(false);
  expect(existsSync(join(dir, "providers.json"))).toBe(true);
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
  // 端点/协议变化 → 需要（hub 拨号面随之变）
  expect(modelsConfigDiffers(dir, [provider({ baseUrl: "https://other.example.com" })])).toBe(true);
  expect(modelsConfigDiffers(dir, [provider({ api: "anthropic" })])).toBe(true);
  // 仅模型参数（contextWindow/maxTokens）变化 → 需要（compaction 阈值/输出上限随之变）
  expect(
    modelsConfigDiffers(dir, [
      provider({
        models: [{ id: "glm-5.3-flash", reasoning: true, vision: false, contextWindow: 200000 }],
      }),
    ]),
  ).toBe(true);
  // 序列化稳定可作对比基准
  expect(serializeProvidersConfig([provider()])).toBe(readFileSync(join(dir, "providers.json"), "utf8"));
});

test("providers.json 读取失败（同路径是目录）：判需重载而不是抛错阻断设置页", () => {
  const dir = tempDir();
  mkdirSync(join(dir, "providers.json"));
  expect(modelsConfigDiffers(dir, [provider()])).toBe(true);
});
