/**
 * 工具行命令摘要：命令**忠实展示**，一行放不下才截断加省略号。
 *
 * 语义：用户要在这行一眼看到「到底执行了什么」。任何内容改写都会让它
 * 不再是原命令——
 * - 剥 flag：`bun test` 与 `bun test --coverage` 是两回事
 * - 剥目录前缀：monorepo 里 `tool-row.tsx` 在 electron 与 mobile 各有一份，
 *   剥成 basename 后界面上是两行一模一样的文字
 * - 切命令链：`cd /a && python3 - <<'EOF' …` 会被切到只剩 `python3`——
 *   heredoc 的 `<<` 撞上重定向规则，正文连同分隔符一起被吃掉（已实测）
 * - 剥 stdin 标记：`python3 -` 里那个孤零零的 `-` 是噪声
 *
 * 所以这里只做两件事：折叠空白（多行命令在行内必须变成一行）、按上限截断
 * 加省略号。除此之外一个字符都不动。
 */

/**
 * 摘要字符上限：单行可容纳的量级（12.5px 等宽字体在对话列宽下约 120 字符）。
 * 超出则截断加「…」。上限不随窗口宽度变（摘要是纯函数，不读 DOM）——
 * 宁可略保守，也不要让同一命令在两个窗口里显示成两副样子。
 */
const MAX_SUMMARY_CHARS = 120;

/** 折叠空白 + 按行折平：多行命令（含 heredoc 正文）在行内必须变成一行。 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
 * 命令摘要：原样展示（空白折叠），超长截断加省略号。垃圾输入降级空串。
 */
export function toolSummary(argsPreview: string): string {
  const raw = flatten(argsPreview);
  if (raw.length === 0) return '';
  // 整段引号短语（如子代理任务描述）脱去外层引号——引号不是内容。
  const quoted = raw.match(/^["'`](.*)["'`]$/s);
  if (quoted?.[1] !== undefined && quoted[1].trim().length > 0) {
    return clip(flatten(quoted[1]));
  }
  return clip(raw);
}
