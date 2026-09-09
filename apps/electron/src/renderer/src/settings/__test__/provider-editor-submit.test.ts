import { describe, expect, test } from 'bun:test';

import type { ProviderModel } from '@paiapp/contracts';
import { buildProviderSubmit } from '../provider-editor';

/**
 * 提交校验纯函数：草稿收编、去重、trim 归一、必填判定、思考形态门控与 key 可选语义。
 * 交互链路（Enter/逗号落模型行、按钮触发 submit、清除 key 两步确认）依赖真机走查。
 */
const glm: ProviderModel = { id: 'glm-4.6', reasoning: true, vision: false };

const base = {
  name: 'zhihu',
  baseUrl: 'https://api.z.ai/api/anthropic',
  api: 'openai-completions',
  models: [] as ProviderModel[],
  modelDraft: '',
  thinkingFormat: 'default',
  apiKey: '',
} as const;

describe('渠道编辑器提交校验', () => {
  test('回归：表单已填仍误报必填缺失——模型 id 只键入未落行，提交时草稿计入模型', () => {
    expect(buildProviderSubmit({ ...base, modelDraft: 'glm-4.6' })).toEqual({
      ok: true,
      input: {
        name: 'zhihu',
        baseUrl: 'https://api.z.ai/api/anthropic',
        api: 'openai-completions',
        models: [{ id: 'glm-4.6', reasoning: false, vision: false }],
        thinkingFormat: 'default',
      },
    });
  });

  test('草稿含半角/全角逗号、换行与空白：切分入列并与已有模型去重；已有能力声明保留', () => {
    const result = buildProviderSubmit({ ...base, models: [glm], modelDraft: ' glm-4.6，glm-5\nglm-5.3 , ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.models).toEqual([
      glm,
      { id: 'glm-5', reasoning: false, vision: false },
      { id: 'glm-5.3', reasoning: false, vision: false },
    ]);
  });

  test('名称、地址与 API 格式前后空白 trim 后进提交载荷', () => {
    const result = buildProviderSubmit({ ...base, name: ' zhihu ', baseUrl: ' https://api.z.ai ', api: ' anthropic-messages ', models: [glm] });
    expect(result).toEqual({
      ok: true,
      input: {
        name: 'zhihu',
        baseUrl: 'https://api.z.ai',
        api: 'anthropic-messages',
        models: [glm],
        thinkingFormat: 'default',
      },
    });
  });

  test('必填缺失：名称空、地址空白、API 格式空、模型与草稿皆空 → incomplete', () => {
    expect(buildProviderSubmit({ ...base, name: ' ', models: [glm] })).toEqual({ ok: false, reason: 'incomplete' });
    expect(buildProviderSubmit({ ...base, baseUrl: ' ', models: [glm] })).toEqual({ ok: false, reason: 'incomplete' });
    expect(buildProviderSubmit({ ...base, api: ' ', models: [glm] })).toEqual({ ok: false, reason: 'incomplete' });
    expect(buildProviderSubmit({ ...base, models: [], modelDraft: ' ,\n ' })).toEqual({ ok: false, reason: 'incomplete' });
  });

  test('思考形态只随 OpenAI 兼容格式透传，其余格式归 default', () => {
    const openai = buildProviderSubmit({ ...base, models: [glm], thinkingFormat: 'openai-reasoning-effort' });
    expect(openai.ok && openai.input.thinkingFormat).toBe('openai-reasoning-effort');
    const anthropic = buildProviderSubmit({ ...base, api: 'anthropic-messages', models: [glm], thinkingFormat: 'openai-reasoning-effort' });
    expect(anthropic.ok && anthropic.input.thinkingFormat).toBe('default');
  });

  test('key 语义：留空省略字段（保持已存 key），有值则带上', () => {
    const kept = buildProviderSubmit({ ...base, models: [glm] });
    expect(kept.ok && 'apiKey' in kept.input).toBe(false);
    const replaced = buildProviderSubmit({ ...base, models: [glm], apiKey: 'sk-x' });
    expect(replaced.ok && replaced.input.apiKey).toBe('sk-x');
  });
});
