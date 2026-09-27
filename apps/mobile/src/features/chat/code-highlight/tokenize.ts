import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import githubLight from '@shikijs/themes/github-light';
import githubDark from '@shikijs/themes/github-dark';
import bashGrammar from '@shikijs/langs/bash';
import javascriptGrammar from '@shikijs/langs/javascript';
import jsonGrammar from '@shikijs/langs/json';
import pythonGrammar from '@shikijs/langs/python';
import typescriptGrammar from '@shikijs/langs/typescript';

export type CodeToken = {
  readonly text: string;
  readonly color: string | null;
  readonly bold: boolean;
  readonly italic: boolean;
};
export type CodeLines = readonly (readonly CodeToken[])[];
export type CodeTheme = 'github-light' | 'github-dark';

/** 语言注册表（单真相）：只登记显式支持的语法，其余整块退等宽纯文本。 */
const languages: Readonly<Record<string, LanguageInput>> = {
  typescript: typescriptGrammar,
  javascript: javascriptGrammar,
  python: pythonGrammar,
  bash: bashGrammar,
  json: jsonGrammar,
};

const languageAliases: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
};

/** 超长代码不高亮（词法时间随体积涨，且长块多为日志不是代码）。 */
const maxHighlightChars = 20_000;
/** 结果缓存上限：条数 + 字符双预算（键含全量代码，防字节级常驻放大；超限淘汰最旧）。 */
const maxCacheEntries = 100;
const maxCacheChars = 500_000;

let highlighterPromise: Promise<HighlighterCore> | null = null;
const cache = new Map<string, CodeLines>();
let cacheChars = 0;

function highlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    langs: Object.values(languages),
    themes: [githubLight, githubDark],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

function resolveLanguage(language: string | undefined): string | null {
  const raw = (language ?? '').trim().toLowerCase();
  if (raw.length === 0) return null;
  const canonical = languageAliases[raw] ?? raw;
  return languages[canonical] === undefined ? null : canonical;
}

/** 代码 → 高亮行（shiki 词法 + 主题色；纯 JS 引擎，Hermes/RNW 可跑）。
 * 语言不识别 / 超长 / 高亮异常 → null（调用方退等宽纯文本，与现状一致）。 */
export async function tokenizeCode(
  code: string,
  language: string | undefined,
  theme: CodeTheme,
): Promise<CodeLines | null> {
  const lang = resolveLanguage(language);
  if (lang === null || code.length > maxHighlightChars) return null;
  const key = `${lang}|${theme}|${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  try {
    const instance = await highlighter();
    const result = instance.codeToTokens(code, { lang, theme });
    const lines: CodeLines = result.tokens.map((row) =>
      row.map((token) => {
        const fontStyle = token.fontStyle ?? 0;
        return {
          text: token.content,
          color: token.color ?? null,
          bold: (fontStyle & 2) !== 0,
          italic: (fontStyle & 1) !== 0,
        };
      }),
    );
    while (cache.size >= maxCacheEntries || cacheChars >= maxCacheChars) {
      const oldest = cache.keys().next();
      if (oldest.done === true) break;
      const [oldKey, oldLines] = [oldest.value, cache.get(oldest.value)] as [string, CodeLines];
      cache.delete(oldKey);
      cacheChars -= oldKey.length + oldLines.reduce((sum, row) => sum + row.reduce((inner, token) => inner + token.text.length, 0), 0);
    }
    cache.set(key, lines);
    cacheChars += key.length + code.length;
    return lines;
  } catch {
    return null;
  }
}
