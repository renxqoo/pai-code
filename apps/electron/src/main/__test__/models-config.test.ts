import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeModelsConfig, serializeModelsConfig, modelsConfigDiffers } from '../models-config';
import type { ProviderConfig } from '@paiapp/contracts';
import type { ProviderKeyStore } from '../file-settings';

/**
 * models.json 生成回归：模型条目缺 reasoning 时 pi 侧思考档只有 Off（症状：会话思考不可选）；
 * 缺 vision 声明时 pi 按纯文本模型处理（症状：多模态模型收不到图片，发送时被剥成占位文本）——
 * 能力声明与思考形态必须完整落进生成文件。
 */

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pai-models-config-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const memoryKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: (name) => (name === 'glm' ? 'sk-secret' : null),
  setKey: () => undefined,
  keyNames: ['glm'],
};

const provider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  name: 'glm',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  api: 'openai-completions',
  models: [{ id: 'glm-5.3-flash', reasoning: true, vision: false }],
  thinkingFormat: 'zai',
  ...overrides,
});

test('症状回归：reasoning 模型生成 reasoning:true；vision 模型生成 input:["text","image"]；thinkingFormat 非 default 落 compat；key 只以 $ENV 引用', () => {
  const dir = tempDir();
  const { env } = writeModelsConfig(dir, [provider({ models: [{ id: 'glm-5.3-flash', reasoning: true, vision: true }] })], memoryKeyStore);
  const file = JSON.parse(readFileSync(join(dir, 'models.json'), 'utf8')) as {
    providers: Record<string, { apiKey: string; compat?: { thinkingFormat: string }; models: { id: string; reasoning?: boolean; input?: string[] }[] }>;
  };
  const glm = file.providers['glm'];
  expect(glm?.models).toEqual([{ id: 'glm-5.3-flash', reasoning: true, input: ['text', 'image'] }]);
  expect(glm?.compat).toEqual({ thinkingFormat: 'zai' });
  expect(glm?.apiKey).toBe('$PAI_KEY_GLM');
  expect(env).toEqual({ PAI_KEY_GLM: 'sk-secret' });
});

test('症状回归：未声明 vision 的多模态模型图片被剥（pi 侧 input 缺省 ["text"]）——vision:false 不写 input 字段', () => {
  const file = JSON.parse(serializeModelsConfig([provider()])) as {
    providers: Record<string, { models: { id: string; input?: string[] }[] }>;
  };
  expect(file.providers['glm']?.models).toEqual([{ id: 'glm-5.3-flash', reasoning: true }]);
});

test('reasoning:false 与 default 形态不写多余字段（生成面最小化）', () => {
  const dir = tempDir();
  writeModelsConfig(dir, [provider({ models: [{ id: 'm', reasoning: false, vision: false }], thinkingFormat: 'default' })], memoryKeyStore);
  const file = JSON.parse(readFileSync(join(dir, 'models.json'), 'utf8')) as {
    providers: Record<string, { compat?: unknown; models: { id: string; reasoning?: boolean }[] }>;
  };
  const glm = file.providers['glm'];
  if (glm === undefined) throw new Error('provider missing');
  expect('compat' in glm).toBe(false);
  expect(glm.models).toEqual([{ id: 'm' }]);
});

test('症状回归：非 OpenAI 兼容格式写入 thinkingFormat 被忽略（compat 只对 openai-completions 生效）', () => {
  const file = JSON.parse(
    serializeModelsConfig([
      provider({ api: 'anthropic-messages' }),
      provider({ name: 'google', api: 'google-generative-ai' }),
    ]),
  ) as {
    providers: Record<string, { compat?: unknown }>;
  };
  expect('compat' in (file.providers['glm'] ?? {})).toBe(false);
  expect('compat' in (file.providers['google'] ?? {})).toBe(false);
  // 同配置下 openai-completions 仍落 compat（对照组，证明门控只按 api 判定）
  const openai = JSON.parse(serializeModelsConfig([provider()])) as { providers: Record<string, { compat?: { thinkingFormat: string } }> };
  expect(openai.providers['glm']?.compat).toEqual({ thinkingFormat: 'zai' });
});

test('modelsConfigDiffers：能力/形态变更与文件缺失都判需重载；一致时判无需', () => {
  const dir = tempDir();
  mkdirSync(dir, { recursive: true });
  // 缺文件 → 需要
  expect(modelsConfigDiffers(dir, [provider()])).toBe(true);
  writeModelsConfig(dir, [provider()], memoryKeyStore);
  // 与磁盘一致 → 不需要
  expect(modelsConfigDiffers(dir, [provider()])).toBe(false);
  // 仅 reasoning 变化（provider 名与模型 id 不变）→ 需要（旧判定按名集合会漏）
  expect(modelsConfigDiffers(dir, [provider({ models: [{ id: 'glm-5.3-flash', reasoning: false, vision: false }] })])).toBe(true);
  // 仅 vision 变化（多模态声明补开）→ 需要
  expect(modelsConfigDiffers(dir, [provider({ models: [{ id: 'glm-5.3-flash', reasoning: true, vision: true }] })])).toBe(true);
  // 仅思考形态变化 → 需要
  expect(modelsConfigDiffers(dir, [provider({ thinkingFormat: 'qwen' })])).toBe(true);
  // 序列化稳定可作对比基准
  expect(serializeModelsConfig([provider()])).toBe(readFileSync(join(dir, 'models.json'), 'utf8'));
});

test('models.json 读取失败（同路径是目录）：判需重载而不是抛错阻断设置页', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'models.json'));
  expect(modelsConfigDiffers(dir, [provider()])).toBe(true);
});
