/**
 * 按需 grammar 的 Shiki 高亮插件，实现 streamdown 的 CodeHighlighterPlugin 协议。
 * 语言清单限定 code-languages（grammar 经动态 import 独立分块，首块代码才拉取），
 * github 亮暗双主题随 .dark 类切换；不引 shiki 全量 bundled languages。
 * highlight 首次调用时才创建 highlighter；已就绪则同步返回 token 结果，
 * 未就绪经 callback 异步补交（上游约定）。高亮失败静默降级为无高亮纯文本。
 */
import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
  type ThemeRegistrationAny,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { TokensResult } from 'shiki';
import type { CodeHighlighterPlugin, HighlightOptions } from 'streamdown';

import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';

import { hasHighlightGrammar, registeredGrammars, resolveCodeGrammar, type RegisteredGrammar } from './code-languages';

const grammarLoaders: Readonly<Record<RegisteredGrammar, () => Promise<LanguageRegistration[]>>> = {
  css: () => import('shiki/langs/css.mjs').then((module) => module.default),
  diff: () => import('shiki/langs/diff.mjs').then((module) => module.default),
  go: () => import('shiki/langs/go.mjs').then((module) => module.default),
  html: () => import('shiki/langs/html.mjs').then((module) => module.default),
  javascript: () => import('shiki/langs/javascript.mjs').then((module) => module.default),
  json: () => import('shiki/langs/json.mjs').then((module) => module.default),
  jsx: () => import('shiki/langs/jsx.mjs').then((module) => module.default),
  markdown: () => import('shiki/langs/markdown.mjs').then((module) => module.default),
  python: () => import('shiki/langs/python.mjs').then((module) => module.default),
  rust: () => import('shiki/langs/rust.mjs').then((module) => module.default),
  shellscript: () => import('shiki/langs/shellscript.mjs').then((module) => module.default),
  sql: () => import('shiki/langs/sql.mjs').then((module) => module.default),
  toml: () => import('shiki/langs/toml.mjs').then((module) => module.default),
  tsx: () => import('shiki/langs/tsx.mjs').then((module) => module.default),
  typescript: () => import('shiki/langs/typescript.mjs').then((module) => module.default),
  yaml: () => import('shiki/langs/yaml.mjs').then((module) => module.default),
};

const lightTheme: ThemeRegistrationAny = githubLight;
const darkTheme: ThemeRegistrationAny = githubDark;

/** token 结果缓存上限：对话正文按块增量高亮，超限淘汰最早条目，防长会话无限增长 */
const TOKEN_CACHE_LIMIT = 200;

const tokenCache = new Map<string, TokensResult>();
const pendingCallbacks = new Map<string, Set<(result: TokensResult) => void>>();

let highlighterPromise: Promise<HighlighterCore> | null = null;

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [lightTheme, darkTheme],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }).catch((error: unknown) => {
    // 失败后清空缓存句柄，下一个块可重试创建
    highlighterPromise = null;
    throw error;
  });
  return highlighterPromise;
}

async function ensureLanguage(highlighter: HighlighterCore, lang: RegisteredGrammar | 'text'): Promise<void> {
  if (lang === 'text') return;
  if (highlighter.getLoadedLanguages().includes(lang)) return;
  const loader = grammarLoaders[lang];
  if (loader === undefined) return;
  await highlighter.loadLanguage(loader());
}

function cacheTokens(key: string, result: TokensResult): void {
  tokenCache.delete(key);
  if (tokenCache.size >= TOKEN_CACHE_LIMIT) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  tokenCache.set(key, result);
}

function highlight({ code, language }: HighlightOptions, callback?: (result: TokensResult) => void): TokensResult | null {
  const lang = resolveCodeGrammar(language);
  const key = `${lang}\u0000${code}`;
  const cached = tokenCache.get(key);
  if (cached !== undefined) return cached;
  if (callback !== undefined) {
    const listeners = pendingCallbacks.get(key) ?? new Set<(result: TokensResult) => void>();
    listeners.add(callback);
    pendingCallbacks.set(key, listeners);
  }
  void loadHighlighter()
    .then((highlighter) => ensureLanguage(highlighter, lang).then(() => highlighter))
    .then(
      (highlighter) => {
        const listeners = pendingCallbacks.get(key);
        if (listeners === undefined) return;
        pendingCallbacks.delete(key);
        try {
          const result = highlighter.codeToTokens(code, { lang, themes: { light: lightTheme, dark: darkTheme } });
          cacheTokens(key, result);
          for (const listener of listeners) listener(result);
        } catch {
          // 单块高亮失败只影响该块（保持无高亮纯文本），不阻断其余块
        }
      },
      () => {
        pendingCallbacks.delete(key);
      },
    );
  return null;
}

/** 对话正文代码块高亮插件：语言清单见 code-languages，双主题由 .dark 类切换 */
const codePlugin: CodeHighlighterPlugin = {
  name: 'shiki',
  type: 'code-highlighter',
  getThemes: () => ['github-light', 'github-dark'],
  getSupportedLanguages: () => [...registeredGrammars],
  supportsLanguage: (language) => hasHighlightGrammar(language),
  highlight,
};

export { codePlugin };
