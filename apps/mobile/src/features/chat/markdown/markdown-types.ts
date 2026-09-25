export type MarkdownInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; content: readonly MarkdownInline[] }
  | { kind: 'emphasis'; content: readonly MarkdownInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; content: readonly MarkdownInline[]; href: string };

export type MarkdownListItem = { indent: number; content: readonly MarkdownInline[] };

export type MarkdownBlock =
  | { kind: 'heading'; level: number; content: readonly MarkdownInline[] }
  | { kind: 'paragraph'; content: readonly MarkdownInline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: readonly MarkdownListItem[] }
  | { kind: 'quote'; content: readonly MarkdownInline[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'divider' };
