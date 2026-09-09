import { describe, expect, test } from 'bun:test';

import { API_FORMAT_IDS, ApiFormatSchema, isApiFormat, parseSettings } from '../settings';

/** API 格式词表：顺序/封闭性与持久化宽松读的回归。 */
describe('API 格式词表', () => {
  test('导出词表与 schema 选项逐项一致且顺序稳定', () => {
    expect(API_FORMAT_IDS).toEqual([...ApiFormatSchema.options]);
    expect(API_FORMAT_IDS).toEqual([
      'openai-completions',
      'openai-responses',
      'anthropic-messages',
      'google-generative-ai',
      'mistral-conversations',
    ]);
  });

  test('isApiFormat：词表内 true，其余（含需特殊鉴权的格式）false', () => {
    for (const id of API_FORMAT_IDS) expect(isApiFormat(id)).toBe(true);
    for (const id of ['pi-messages', 'azure-openai-responses', 'bedrock-converse-stream', 'google-vertex', 'openai-codex-responses', '', 'OpenAI-Completions']) {
      expect(isApiFormat(id)).toBe(false);
    }
  });

  test('磁盘上手写的非词表 api 不被判非法（不整表降级丢配置）', () => {
    const settings = parseSettings({
      providers: [{ name: 'custom', baseUrl: 'https://x.example.com', api: 'pi-messages', models: [{ id: 'm', reasoning: false, vision: false }], thinkingFormat: 'default' }],
    });
    expect(settings.providers).toHaveLength(1);
    expect(settings.providers[0]?.api).toBe('pi-messages');
  });
});
