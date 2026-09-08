import { describe, expect, test } from 'bun:test';

import { grammarAliases, hasHighlightGrammar, registeredGrammars, resolveCodeGrammar } from '../code-languages';

describe('resolveCodeGrammar', () => {
  test('语言本名映射到对应 grammar', () => {
    expect(resolveCodeGrammar('typescript')).toBe('typescript');
    expect(resolveCodeGrammar('tsx')).toBe('tsx');
    expect(resolveCodeGrammar('json')).toBe('json');
    expect(resolveCodeGrammar('python')).toBe('python');
    expect(resolveCodeGrammar('zsh')).toBe('shellscript');
    expect(resolveCodeGrammar('yaml')).toBe('yaml');
    expect(resolveCodeGrammar('diff')).toBe('diff');
  });

  test('常用别名归一到同一 grammar', () => {
    expect(resolveCodeGrammar('ts')).toBe('typescript');
    expect(resolveCodeGrammar('js')).toBe('javascript');
    expect(resolveCodeGrammar('mjs')).toBe('javascript');
    expect(resolveCodeGrammar('py')).toBe('python');
    expect(resolveCodeGrammar('rs')).toBe('rust');
    expect(resolveCodeGrammar('golang')).toBe('go');
    expect(resolveCodeGrammar('yml')).toBe('yaml');
    expect(resolveCodeGrammar('md')).toBe('markdown');
    expect(resolveCodeGrammar('sh')).toBe('shellscript');
    expect(resolveCodeGrammar('patch')).toBe('diff');
  });

  test('大小写与首尾空白不影响映射', () => {
    expect(resolveCodeGrammar(' TS ')).toBe('typescript');
    expect(resolveCodeGrammar('Python')).toBe('python');
    expect(resolveCodeGrammar('JSON')).toBe('json');
  });

  test('空标注与未收录语言降级纯文本，不抛错', () => {
    expect(resolveCodeGrammar('')).toBe('text');
    expect(resolveCodeGrammar('cobol')).toBe('text');
    expect(resolveCodeGrammar('perl6')).toBe('text');
  });
});

describe('hasHighlightGrammar', () => {
  test('清单内语言为 true', () => {
    expect(hasHighlightGrammar('go')).toBe(true);
    expect(hasHighlightGrammar('bash')).toBe(true);
  });

  test('空标注、纯文本别名与未收录语言为 false', () => {
    expect(hasHighlightGrammar('')).toBe(false);
    expect(hasHighlightGrammar('text')).toBe(false);
    expect(hasHighlightGrammar('plaintext')).toBe(false);
    expect(hasHighlightGrammar('lua')).toBe(false);
  });
});

describe('registeredGrammars 与别名表一致性', () => {
  test('别名表无重复键指向矛盾（同键同值由对象字面量保证），值域落在 grammar 清单内', () => {
    const grammarIds = new Set<string>(registeredGrammars);
    for (const grammar of Object.values(grammarAliases)) {
      expect(grammarIds.has(grammar)).toBe(true);
    }
  });

  test('每个注册 grammar 至少有一个别名入口', () => {
    const covered = new Set<string>(Object.values(grammarAliases));
    for (const grammar of registeredGrammars) {
      expect(covered.has(grammar)).toBe(true);
    }
  });

  test('语言清单数量受控（按需打包的体积红线）', () => {
    expect(registeredGrammars.length).toBeLessThanOrEqual(20);
  });
});
