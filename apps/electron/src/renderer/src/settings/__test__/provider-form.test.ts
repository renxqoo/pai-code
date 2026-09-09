import { describe, expect, test } from 'bun:test';

import type { ProviderModel } from '@paiapp/contracts';
import { buildProviderSubmit } from '../provider-form';

/**
 * 提交校验纯函数：草稿收编、去重、trim 归一与必填判定。
 * 交互链路（Enter/逗号落 chips、按钮触发 submit）依赖真机走查。
 */
const glm: ProviderModel = { id: 'glm-4.6', reasoning: true, vision: false };

describe('provider 表单提交校验', () => {
  test('回归：表单已填仍误报必填缺失——模型 id 只键入未落 chips，提交时草稿计入模型', () => {
    expect(buildProviderSubmit({ name: 'zhihu', baseUrl: 'https://api.z.ai/api/anthropic', models: [], modelDraft: 'glm-4.6' })).toEqual({
      ok: true,
      name: 'zhihu',
      baseUrl: 'https://api.z.ai/api/anthropic',
      models: [{ id: 'glm-4.6', reasoning: false, vision: false }],
    });
  });

  test('草稿含半角/全角逗号、换行与空白：切分入列并与已有 chips 去重；已有能力声明保留', () => {
    const result = buildProviderSubmit({ name: 'p', baseUrl: 'http://x', models: [glm], modelDraft: ' glm-4.6，glm-5\nglm-5.3 , ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models).toEqual([
      glm,
      { id: 'glm-5', reasoning: false, vision: false },
      { id: 'glm-5.3', reasoning: false, vision: false },
    ]);
  });

  test('名称与地址前后空白 trim 后进提交载荷', () => {
    const result = buildProviderSubmit({ name: ' zhihu ', baseUrl: ' https://api.z.ai ', models: [glm], modelDraft: '' });
    expect(result).toEqual({ ok: true, name: 'zhihu', baseUrl: 'https://api.z.ai', models: [glm] });
  });

  test('必填缺失：名称空、地址空白、模型与草稿皆空 → incomplete', () => {
    expect(buildProviderSubmit({ name: '', baseUrl: 'http://x', models: [glm], modelDraft: '' })).toEqual({ ok: false, reason: 'incomplete' });
    expect(buildProviderSubmit({ name: 'p', baseUrl: ' ', models: [glm], modelDraft: '' })).toEqual({ ok: false, reason: 'incomplete' });
    expect(buildProviderSubmit({ name: 'p', baseUrl: 'http://x', models: [], modelDraft: ' ,\n ' })).toEqual({ ok: false, reason: 'incomplete' });
  });
});
