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

import { clipAtWord } from '@paiapp/contracts';

/**
 * 摘要字符上限：单行可容纳的量级。**这是 JS 层的兜底，不是排版保证**——
 * 对话列有 max-w-[960px] 硬上限，等宽 12.5px 下满宽约 114 字符，默认窗约 100、
 * 最小窗约 60，所以真正决定显示量的是 CSS truncate；这里只保证
 * 「DOM 里不进超长文本」与「省略号由我们统一产出，不与 CSS 的省略号叠加」。
 * 取 120 = 最宽合法窗口的保守上界。
 */
const MAX_SUMMARY_CHARS = 120;

/** 折叠空白 + 按行折平：多行命令（含 heredoc 正文）在行内必须变成一行。 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 命令摘要：原样展示（只折叠空白），超长按词边界截断加省略号。
 *
 * 不剥引号：引号对 shell 是语法内容（`"./lint.sh" --fix "src/**"` 剥成
 * `./lint.sh" --fix "src/**` 是撕破命令，比多两个字符糟得多）。
 * 截断走 `clipAtWord` 共享实现（不劈代理对 + 有词边界才回退）。
 */
export function toolSummary(argsPreview: string): string {
  return clipAtWord(flatten(argsPreview), MAX_SUMMARY_CHARS);
}
