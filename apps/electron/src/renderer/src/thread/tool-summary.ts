/**
 * 工具行摘要派生（文案为主）：argsPreview 可能是完整命令串、shell 链或绝对路径，
 * 列表行只显示人话摘要（动作 + 对象名），完整内容在展开详情。
 * 三条硬规则：不透出绝对路径/目录前缀、不透出 shell 标志与数值参数、不透出命令链。
 */

const SHELL_OPERATORS = /\s*(?:&&|\|\||;|\||>|<)\s*/;
const CHANGE_DIR_VERBS = new Set(['cd', 'export', 'set']);
const FLAG = /^-/;
const NUMERIC_ARG = /^[0-9]+(?:[,:][0-9]*)*p?$/;

function stripQuotes(token: string): string {
  return token.replace(/^["'`]+|["'`]+$/g, '');
}

/** 路径化 token 归一为对象名：`apps/mobile/src/strings/zh.ts` → `zh.ts`。 */
function objectName(token: string): string {
  const clean = stripQuotes(token);
  const segments = clean.split(/[\\/]/);
  return segments.at(-1) ?? clean;
}

function tokenize(segment: string): string[] {
  return segment.trim().split(/\s+/).map(stripQuotes).filter((token) => token.length > 0);
}

/**
 * 人话摘要：命令链取首个实质段（跳过 cd/export），剥路径前缀、丢 flag 与数值参数，
 * 保留动词与对象词干；多段命令补省略号。垃圾输入安全降级空串。
 */
export function toolSummary(argsPreview: string): string {
  const raw = argsPreview.trim();
  if (raw.length === 0) return '';
  // 整段引号短语（如任务描述）原样保留，不再拆词。
  const quoted = raw.match(/^["'`](.*)["'`]$/s);
  if (quoted?.[1] !== undefined && quoted[1].trim().length > 0) return quoted[1].trim();
  const segments = raw.split(SHELL_OPERATORS).filter((part) => part.trim().length > 0);
  const primaryIndex = segments.findIndex((part) => {
    const verb = stripQuotes(part.trim().split(/\s+/)[0] ?? '');
    return !CHANGE_DIR_VERBS.has(verb);
  });
  const primary = segments[primaryIndex] ?? segments[0] ?? '';
  const words = tokenize(primary)
    .filter((token) => !FLAG.test(token))
    .filter((token) => !NUMERIC_ARG.test(token))
    .map((token, index) => (index === 0 && !token.includes('/') ? token : objectName(token)));
  // 不补省略号：摘要已经吃满整行宽度（自适应铺满），再画个「…」
  // 只会读成「内容被截断了」——多段命令本就只取首段，这是既定口径
  return words.join(' ');
}
