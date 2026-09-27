/**
 * 工具行命令摘要：行内展示形态（单行），内容加工只有两件。
 *
 * 前提：`argsPreview` **保留换行**（用户裁决口径 B，对齐 pi 的 `formatShellCall`
 * ——它原样显示 command，靠 TUI 按真实宽度裁剪）。换行在数据层留着，行边界、
 * 注释行、heredoc 正文都还在，下游才有条件做下面两件事：
 *
 * 1. **去整行 shell 注释**：模型常在命令前写一段说明
 *    （`# meter 54 用例全绿。四门全跑`）。它承载的是说明，不是这行执行的动作；
 *    折平后它与命令连成一行、边界不可恢复，界面上看起来就像「思考被写进了工具
 *    执行的消息里」——那不是 thinking，是 `#` 注释。在折平前处理是唯一可行处。
 * 2. **折成一行**：行内只能占一行，剩余换行在此收口。
 *
 * 不做的加工（都试过并被否掉——它们让显示的不再是原命令）：
 * 剥 flag（`bun test` 与 `bun test --coverage` 是两回事）、剥目录前缀（monorepo 里
 * `tool-row.tsx` 在 electron 与 mobile 各有一份，剥成 basename 后界面上是两行
 * 一模一样的文字）、切命令链（`cd /a && b` 会只剩 `cd`）、剥引号（`"./lint.sh" --fix`
 * 剥成 `./lint.sh" --fix` 是撕破命令）、长度截断（交给 CSS `truncate` 按真实渲染
 * 宽度裁剪——等宽字体下 CJK 是 ASCII 两倍宽，任何 JS 字符上限都表达不了「一行放不下」）。
 */

/** 整行 shell 注释（`#` / `;` 起头）。只匹配整行——行内注释（`ls # x`）折平后
 * 无法与「参数里带 #」区分，故一律保留（保守：宁可多显示，不可吃掉命令片段）。 */
const COMMENT_LINE = /^\s*[#;]/;

export function toolSummary(argsPreview: string): string {
  const withoutComments = argsPreview
    .split('\n')
    .filter((line) => !COMMENT_LINE.test(line))
    .join(' ');
  return withoutComments.replace(/\s+/g, ' ').trim();
}
