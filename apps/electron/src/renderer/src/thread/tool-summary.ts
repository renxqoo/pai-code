/**
 * 工具行命令摘要：命令**忠实展示**，只把多行折成一行。
 *
 * 语义：用户要在这行一眼看到「到底执行了什么」。任何内容改写都会让它
 * 不再是原命令——
 * - 剥 flag：`bun test` 与 `bun test --coverage` 是两回事
 * - 剥目录前缀：monorepo 里 `tool-row.tsx` 在 electron 与 mobile 各有一份，
 *   剥成 basename 后界面上是两行一模一样的文字
 * - 切命令链：`cd /a && python3 - <<'EOF' …` 会被切到只剩 `python3`
 * - 剥 stdin 标记：`python3 -` 里那个孤零零的 `-` 是噪声
 *
 * **不做长度截断**（用户裁决口径 A）：截断交给行内的 CSS `truncate`。
 * 任何 JS 侧的字符上限都表达不了「一行放不下」——等宽字体下 CJK 是 ASCII 的
 * 两倍宽，同一个常量在中文命令与英文命令下的实际显示量差一倍；而 CSS 按
 * 真实渲染宽度截断，每个窗口显示该窗口能放下的全部。此前 JS 截 120 + CSS
 * 再兜底，会让 JS 产出的省略号被 CSS 的省略号顶出可视区（两个 `…` 叠加）。
 *
 * 只做一件事：折叠空白——多行命令（含 heredoc 正文）在行内必须变成一行。
 */
export function toolSummary(argsPreview: string): string {
  return argsPreview.replace(/\s+/g, ' ').trim();
}
