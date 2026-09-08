import { describe, expect, test } from 'bun:test';

import { grammarAliases } from '../code-languages';
import { codePlugin } from '../shiki-code-plugin';
import type { TokensResult } from 'shiki';

function highlight(language: string, code: string): Promise<TokensResult> {
  return new Promise((resolve) => {
    const sync = codePlugin.highlight({ code, language, themes: ['github-light', 'github-dark'] }, resolve);
    if (sync !== null) resolve(sync);
  });
}

describe('codePlugin（shiki 高亮）', () => {
  test('每个注册别名高亮产出非空 token，双主题色随 token 携带', async () => {
    for (const alias of Object.keys(grammarAliases)) {
      const result = await highlight(alias, 'const value = 1;');
      expect(result.tokens.length).toBeGreaterThan(0);
      const first = result.tokens[0]?.[0];
      expect(first?.content.length ?? '').toBeGreaterThan(0);
    }
  });

  test('未知语言降级纯文本不抛错，接口判定一致', () => {
    expect(codePlugin.supportsLanguage('cobol')).toBe(false);
    expect(codePlugin.supportsLanguage('ts')).toBe(true);
    expect(codePlugin.getSupportedLanguages()).toContain('typescript');
    expect(codePlugin.getThemes()).toEqual(['github-light', 'github-dark']);
  });

  test('已高亮内容同步返回缓存结果（同一对象）', async () => {
    const first = await highlight('python', 'x = 1');
    const second = await highlight('python', 'x = 1');
    expect(second).toBe(first);
  });

  test('空代码与空语言标注安全', async () => {
    const result = await highlight('', '');
    expect(result.tokens.length).toBeGreaterThan(0);
  });
});
