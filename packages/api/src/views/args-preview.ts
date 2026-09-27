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

/**
 * 预览归一：**只截断，不折行**。
 *
 * 换行必须原样保留（用户裁决口径 B，对齐 pi 的 `formatShellCall`——它原样显示
 * command，靠 TUI 按真实宽度裁剪）。早前这里做 `\s+ → ' '`，把多行命令压成一行，
 * 后果有三：
 * - 模型的 shell 注释（`# meter 54 用例全绿。\ncd …`）与命令粘连，显示成
 *   「思考被写进工具执行行」——它不是 thinking，是注释，粘连后无从分辨；
 * - heredoc 正文、多段命令的行边界一并丢失，下游再想按行判断（比如去掉注释
 *   行）就 information-theoretically 不可能了——折平后两者之间没有任何分隔标记；
 * - `title` 提示与行内展示同源折叠，用户 hover 也看不到原始命令的分行结构。
 *
 * 截断仍走 `clipText` 共享实现（不劈代理对 + 超限加省略号）——同一「截断」在仓库里
 * 曾有四份四种口径，已收敛到 contracts。截断按行边界优先，避免把一行劈成两半。
 */
export function clip(text: string): string {
  if (text.length <= PREVIEW_LIMIT) return text;
  const budget = PREVIEW_LIMIT - 1;
  const head = text.slice(0, budget);
  // 行边界优先：在预算内切到最后一个换行，别把一行劈成两半；
  // 没有换行（单行长命令）时按码元硬切——由 clipText 承担代理对保护
  const lastBreak = head.lastIndexOf('\n');
  if (lastBreak > budget / 2) {
    // 行边界切点不会落在代理对中间（`\n` 是独立码元），直接补省略号
    return `${head.slice(0, lastBreak)}…`;
  }
  // 无换行可依：整段交给 clipText（它按 max 含省略号做预算 + 不劈代理对）
  return clipText(text, PREVIEW_LIMIT);
}

/**
 * 单行化 + 截断：给**天生是一行文本**的字段用（子代理的 agent 名 / 任务描述）。
 *
 * 与 `clip` 的区别：`clip` 保留换行给命令预览（行边界要留给渲染层判断注释/heredoc），
 * 这里直接折成一行——任务描述是给人读的一句话，多行渲染会破版。
 */
export function clipOneLine(text: string): string {
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
