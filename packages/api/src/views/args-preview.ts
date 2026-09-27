/** 工具参数 → 单行预览（命令类工具显示命令本体，其余显示关键参数）。 */

import { clipText } from '@paiapp/contracts';

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

/** 预览归一：空白折叠 + 截断（预览域同一语义，argsPreview 与 subagents 展开共用）。
 * 截断走 `clipText` 共享实现——同一「截断 + 不劈代理对」在仓库里曾有四份
 * 四种口径（上限/省略号/代理对保护各不相同），已收敛到 contracts。 */
export function clip(text: string): string {
  return clipText(text.replace(/\s+/g, ' ').trim(), PREVIEW_LIMIT);
}

/** 预览序列化的体积防御：只序列化浅层。 */
function smallValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 3);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 5)) out[key] = item;
  return out;
}
