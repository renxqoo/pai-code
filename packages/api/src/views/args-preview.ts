/** 工具参数 → 单行预览（命令类工具显示命令本体，其余显示关键参数）。 */

import { clipText, isCommentLine } from '@paiapp/contracts';


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
 *
 * 注释行不占预算：展示层（toolSummary）会把整行注释剥掉，若截断预算先被注释
 * 吃光（模型常在命令前写长段 `# 说明`），剥掉后行内就什么都不剩——「已运行」
 * 后面没有命令。截断时非注释行优先装车（它们才是会展示的内容），注释行装不下
 * 就丢（从头部丢起，丢过必带省略号）；整段皆注释才退回无差别整段截断。
 */
export function clip(text: string): string {
  if (text.length <= PREVIEW_LIMIT) return text;
  const lines = text.split('\n');
  // 趟 1：非注释行按序装车（含换行位计成本；末行多算一位无害）；注释行候选保留
  const kept: string[] = [];
  const keptComment: boolean[] = [];
  let used = 0;
  let droppedTail = false;
  for (const line of lines) {
    if (isCommentLine(line)) {
      kept.push(line);
      keptComment.push(true);
      continue;
    }
    if (used + line.length + 1 > PREVIEW_LIMIT + 1) {
      // 首个非注释行即超预算：硬切保内容（clipText 含省略号与代理对保护），后续全丢
      if (used === 0) {
        kept.push(clipText(line, PREVIEW_LIMIT));
        keptComment.push(false);
      }
      droppedTail = true;
      break;
    }
    kept.push(line);
    keptComment.push(false);
    used += line.length + 1;
  }
  return finalizeClip(kept, keptComment, droppedTail, text);
}

/**
 * 趟 2：总长收口。头部注释行逐个丢弃直到装得下（含省略号位）；丢过注释或截过
 * 尾部都补省略号（对用户如实标记「有内容被吃」）。丢光注释仍超限按行边界切、
 * 回退不到一半硬切；kept 空（整段皆注释）退回原文本无差别截断。
 */
function finalizeClip(kept: string[], keptComment: boolean[], droppedTail: boolean, original: string): string {
  let start = 0;
  while (start < kept.length && keptComment[start] && kept.slice(start).join('\n').length > PREVIEW_LIMIT - 1) {
    start += 1;
  }
  const droppedComment = start > 0;
  const joined = kept.slice(start).join('\n');
  if (joined.length === 0) return clipText(original, PREVIEW_LIMIT);
  const mark = droppedTail || droppedComment;
  if (joined.length + (mark ? 1 : 0) <= PREVIEW_LIMIT && !joined.endsWith('…')) {
    return mark ? `${joined}…` : joined;
  }
  if (joined.endsWith('…') && joined.length <= PREVIEW_LIMIT) return joined;
  // 仍超限：行边界优先切，回退不到一半硬切（代理对保护由 clipText 扛）
  const head = joined.slice(0, PREVIEW_LIMIT - 1);
  const lastBreak = head.lastIndexOf('\n');
  if (lastBreak > (PREVIEW_LIMIT - 1) / 2) return `${head.slice(0, lastBreak)}…`;
  return clipText(joined, PREVIEW_LIMIT);
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
