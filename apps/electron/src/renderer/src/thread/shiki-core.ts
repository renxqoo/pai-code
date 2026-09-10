/**
 * Shiki 高亮核心（进程内单例）：对话正文 code 块（token 流，经 shiki-code-plugin
 * 挂进 streamdown）与文件查看 pane（双主题 HTML）共用同一 highlighter 与 grammar
 * 懒加载面；语言清单限定 code-languages，按需动态 import 独立分块。
 * 双主题随 .dark 类切换（token 路径由 streamdown 处理；HTML 路径用 --shiki-dark
 * CSS 变量，样式见 styles.css .file-code）。
 */
import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
  type ThemeRegistrationAny,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { TokensResult } from 'shiki';

import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import { hasHighlightGrammar, resolveCodeGrammar, type RegisteredGrammar } from './code-languages';

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
/** HTML 结果缓存上限与单条体积上限：file/read 允许 2MiB，超大文件高亮 HTML
 * 可达数 MB——超过体积上限只高亮不缓存（内存预算优先于命中率和重开速度）。 */
const HTML_CACHE_LIMIT = 16;
const HTML_CACHE_MAX_CODE_BYTES = 256 * 1024;

const tokenCache = new Map<string, TokensResult>();
const htmlCache = new Map<string, string>();
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

function cacheHtml(key: string, html: string): void {
  htmlCache.delete(key);
  if (htmlCache.size >= HTML_CACHE_LIMIT) {
    const oldest = htmlCache.keys().next().value;
    if (oldest !== undefined) htmlCache.delete(oldest);
  }
  htmlCache.set(key, html);
}

/**
 * token 流高亮（streamdown 插件协议形态）：已就绪同步返回，未就绪经 callback
 * 异步补交；失败静默降级为无高亮纯文本。
 */
export function highlightTokens(
  { code, language }: { code: string; language: string },
  callback?: (result: TokensResult) => void,
): TokensResult | null {
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

/**
 * 双主题 HTML 高亮（文件查看 pane）：defaultColor=light，暗色经 --shiki-dark 变量
 * 由 styles.css 切换。未收录语言/纯文本/失败 → null（调用方渲染纯文本 pre）。
 */
export async function highlightFileHtml(code: string, language: string): Promise<string | null> {
  const lang = resolveCodeGrammar(language);
  if (lang === 'text' || !hasHighlightGrammar(language)) return null;
  const cacheable = code.length <= HTML_CACHE_MAX_CODE_BYTES;
  const key = `${lang}\u0000${code}`;
  if (cacheable) {
    const cached = htmlCache.get(key);
    if (cached !== undefined) return cached;
  }
  const highlighter = await loadHighlighter();
  await ensureLanguage(highlighter, lang);
  try {
    const html = highlighter.codeToHtml(code, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: 'light',
    });
    if (cacheable) cacheHtml(key, html);
    return html;
  } catch {
    return null;
  }
}
