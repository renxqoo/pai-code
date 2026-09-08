/**
 * 工具名 → 展示种类：执行单元的图标语义、人话标签与摘要字体由这一个判定出发。
 * 工具名大小写不敏感（协议侧 bash/read 小写，演示与扩展出现过 Bash/Read 首字母大写）。
 * 未知工具不猜测，落 other（标签直接显示原始工具名）。
 */

export type ToolKind = 'bash' | 'read' | 'edit' | 'write' | 'search' | 'list' | 'subagent' | 'other';

const KIND_BY_NAME: Readonly<Record<string, ToolKind>> = {
  bash: 'bash',
  powershell: 'bash',
  zsh: 'bash',
  sh: 'bash',
  read: 'read',
  write: 'write',
  edit: 'edit',
  grep: 'search',
  find: 'search',
  glob: 'search',
  search: 'search',
  ls: 'list',
  dir: 'list',
  task: 'subagent',
  subagent: 'subagent',
  agent: 'subagent',
};

export function toolKindOf(name: string): ToolKind {
  return KIND_BY_NAME[name.trim().toLowerCase()] ?? 'other';
}

const MONO_KINDS: readonly ToolKind[] = ['bash', 'read', 'edit', 'write', 'search', 'list'];

/** 摘要是否用等宽字体：命令与文件路径类参数读起来像终端，其余（URL/名称）用正文字体。 */
export function toolPreviewMono(kind: ToolKind): boolean {
  return MONO_KINDS.includes(kind);
}
