/** GFM 任务列表勾选态归一（T56 M1）：库的 Parser 会静默丢弃 checkbox token，
 * `- [x]` 与普通列表渲染无差别——先把勾选标记归一成可见字形（☑/☐）再进解析器。 */
const taskMarker = /^(\s*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/;

export function normalizeTaskLists(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(taskMarker, (_match, lead: string, mark: string) => `${lead}${mark === ' ' ? '☐' : '☑'}`))
    .join('\n');
}
