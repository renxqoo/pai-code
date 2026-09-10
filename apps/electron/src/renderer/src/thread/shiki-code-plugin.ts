/**
 * streamdown 的 Shiki 代码高亮插件（adapter）：highlighter 单例、grammar 懒加载与
 * token 缓存都在 shiki-core（与文件查看 pane 共用），本文件只做协议挂接。
 */
import type { CodeHighlighterPlugin } from 'streamdown';

import { registeredGrammars, hasHighlightGrammar } from './code-languages';
import { highlightTokens } from './shiki-core';

/** 对话正文代码块高亮插件：语言清单见 code-languages，双主题由 .dark 类切换 */
const codePlugin: CodeHighlighterPlugin = {
  name: 'shiki',
  type: 'code-highlighter',
  getThemes: () => ['github-light', 'github-dark'],
  getSupportedLanguages: () => [...registeredGrammars],
  supportsLanguage: (language) => hasHighlightGrammar(language),
  highlight: highlightTokens,
};

export { codePlugin };
