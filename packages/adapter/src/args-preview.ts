/** 工具参数 → 单行预览（命令类工具显示命令本体，其余显示关键参数）。 */

const COMMAND_FIELDS = ['command', 'cmd'] as const;
const PREVIEW_FIELDS = ['path', 'file_path', 'filePath', 'pattern', 'query', 'url', 'name', 'subagent_type', 'description'] as const;
const PREVIEW_LIMIT = 160;

export function previewArgs(args: Record<string, unknown>): string {
  for (const field of COMMAND_FIELDS) {
    const value = args[field];
    if (typeof value === 'string' && value.length > 0) return clip(value);
  }
  for (const field of PREVIEW_FIELDS) {
    const value = args[field];
    if (typeof value === 'string' && value.length > 0) return clip(value);
  }
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  const first = entries[0];
  if (first === undefined) return '';
  const value = first[1];
  if (typeof value === 'string') return clip(value);
  return clip(JSON.stringify(smallValue(value)));
}

function clip(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > PREVIEW_LIMIT ? `${single.slice(0, PREVIEW_LIMIT - 1)}…` : single;
}

/** 预览序列化的体积防御：只序列化浅层。 */
function smallValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 3);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 5)) out[key] = item;
  return out;
}
