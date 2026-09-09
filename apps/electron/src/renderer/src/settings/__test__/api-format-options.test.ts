import { describe, expect, test } from 'bun:test';

import { API_FORMAT_IDS } from '@paiapp/contracts';
import { copy } from '@/strings';
import { apiFormatLabel, apiFormatOptions } from '../api-format-options';

describe('API 格式选项', () => {
  test('词表顺序即展示顺序，词表内值不追加回退项', () => {
    const options = apiFormatOptions('anthropic-messages');
    expect(options.map((option) => option.id)).toEqual([...API_FORMAT_IDS]);
    expect(options.every((option) => option.label.length > 0)).toBe(true);
  });

  test('词表外值（磁盘手写格式）追加回退项，保留原值不被静默改写', () => {
    const options = apiFormatOptions('azure-openai-responses');
    expect(options.at(-1)).toEqual({ id: 'azure-openai-responses', label: copy.settings.apiFormatUnknown('azure-openai-responses') });
    expect(options.slice(0, -1).map((option) => option.id)).toEqual([...API_FORMAT_IDS]);
  });

  test('空值不追加回退项（新建态）', () => {
    expect(apiFormatOptions('').map((option) => option.id)).toEqual([...API_FORMAT_IDS]);
  });

  test('值 → 文案：词表内取词表文案，词表外走自定义回退', () => {
    expect(apiFormatLabel('openai-completions')).toBe(copy.settings.apiFormatOptions['openai-completions']);
    expect(apiFormatLabel('bedrock-converse-stream')).toBe(copy.settings.apiFormatUnknown('bedrock-converse-stream'));
  });
});
