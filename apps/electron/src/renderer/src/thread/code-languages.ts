/**
 * coding-agent 对话场景的 Shiki 高亮语言清单（纯数据 + 纯函数）。
 * 只注册清单内 grammar 控制打包体积；围栏语言未收录时降级纯文本，不抛错。
 */

/** 已注册的 Shiki grammar id（与 shiki-code-plugin 的静态导入一一对应） */
export const registeredGrammars = [
  'css',
  'diff',
  'go',
  'html',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'python',
  'rust',
  'shellscript',
  'sql',
  'toml',
  'tsx',
  'typescript',
  'yaml',
] as const;

export type RegisteredGrammar = (typeof registeredGrammars)[number];

/** 围栏标注 → grammar id（覆盖语言本名与官方常用别名） */
export const grammarAliases: Readonly<Record<string, RegisteredGrammar>> = {
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  javascript: 'javascript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  bash: 'shellscript',
  sh: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  python: 'python',
  py: 'python',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  html: 'html',
  css: 'css',
  markdown: 'markdown',
  md: 'markdown',
  diff: 'diff',
  patch: 'diff',
};

/** 围栏语言标注 → grammar id；未收录（含空标注）降级 'text' 纯文本 */
export function resolveCodeGrammar(language: string): RegisteredGrammar | 'text' {
  const grammar = grammarAliases[language.trim().toLowerCase()];
  return grammar ?? 'text';
}

/** 该围栏语言是否有专属高亮 grammar（纯文本与未收录均无） */
export function hasHighlightGrammar(language: string): boolean {
  return grammarAliases[language.trim().toLowerCase()] !== undefined;
}
