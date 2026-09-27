/**
 * 工具行命令摘要：命令**忠实展示**，一行放不下才截断加省略号。
 *
 * 语义：用户要在这行一眼看到「到底执行了什么」——剥 flag、剥目录前缀、
 * 丢掉脚本正文都会让命令不再是原命令（`bun test` 与 `bun test --coverage`
 * 是两回事，同名文件在不同包下也是两个文件）。所以这里不做任何内容改写，
 * 只做两件事：折叠空白、按容器宽度截断。
 *
 * 命令链（`cd a && b`）取首个实质段（跳过 cd/export/set——它们只改上下文，
 * 不是这行要做的事）；`|`/`;` 之后的段同样不进摘要。
 */

/** shell 运算符：把命令链切成段，取第一段展示。
 *  管道是 `\|`（转义），末尾不得再跟一个裸 `|`——那会变成「或 + 空」的
 *  可选匹配，把命令按字符切开（曾把 `bun test` 切成 b/u/n/t/e/s/t）。 */
const SHELL_OPERATORS = /\s*(?:&&|\|\||;|\|)\s*/;
/** 重定向不属于「这行在做什么」，切掉（`cat > f` → `cat f`）。
 *  字符类里 `>` 是字面量（不是量词），不必转义。 */
const REDIRECT = /\s*(?:>>?|<|>)\s*/;
/** 只改上下文、不产出结果的前置段。 */
const CHANGE_DIR_VERBS = new Set(['cd', 'export', 'set']);

/** 孤零零的 `-`：heredoc 的 stdin 标记（`python3 - <<EOF`），不是对象。
 *  去掉它，`python3 - <<EOF` 才显示为 `python3` 而不是 `python3 -`。 */
const STDIN_MARK = /(^|\s)-$/;

/**
 * 摘要字符上限：单行可容纳的量级。超出则截断加「…」。
 * 上限不随窗口宽度变（摘要派生是纯函数，不读 DOM）——宁可略保守，
 * 也不要让同一命令在两个窗口里显示成两副样子。
 */
const MAX_SUMMARY_CHARS = 120;

function stripQuotes(token: string): string {
  return token.replace(/^["'`]+|["'`]+$/g, '');
}

/** 折叠空白 + 按行折平（多行命令在行内必须变成一行）。 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 命令链 → 首个实质段（跳过 cd/export/set），去掉重定向与 stdin 标记。 */
function primarySegment(raw: string): string {
  const segments = raw
    .split(SHELL_OPERATORS)
    .map((part) => part.split(REDIRECT)[0] ?? '')
    .map((part) => part.replace(STDIN_MARK, '$1').trim())
    .filter((part) => part.length > 0);
  const primaryIndex = segments.findIndex((part) => !CHANGE_DIR_VERBS.has(stripQuotes(part.split(/\s+/)[0] ?? '')));
  return segments[primaryIndex] ?? segments[0] ?? '';
}

/** 截断加省略号：截在词边界上，不把文件名劈成两半。
 *  结果长度含省略号不超过 MAX_SUMMARY_CHARS（上限是展示面承诺）。 */
function clip(text: string): string {
  if (text.length <= MAX_SUMMARY_CHARS) return text;
  const budget = MAX_SUMMARY_CHARS - 1; // 给省略号留位
  const cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > budget / 2 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s,;]+$/, '')}…`;
}

/**
 * 命令摘要：命令链取首个实质段，重定向剥掉，空白折叠，按上限截断加省略号。
 * 垃圾输入安全降级空串。
 */
export function toolSummary(argsPreview: string): string {
  const raw = flatten(argsPreview);
  if (raw.length === 0) return '';
  // 整段引号短语（如任务描述）原样保留。
  const quoted = raw.match(/^["'`](.*)["'`]$/s);
  if (quoted?.[1] !== undefined && quoted[1].trim().length > 0) {
    return clip(flatten(quoted[1]));
  }
  return clip(primarySegment(raw));
}
