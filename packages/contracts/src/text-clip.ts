/**
 * 文本截断的唯一实现。
 *
 * 此前同一份「截断 + 加省略号 + 不劈代理对」在仓库里写了四遍
 * （args-preview / edit-hunks / tool-summary / turn-anchor-data），四份口径
 * 互相矛盾：上限不同、有的加省略号有的不加、有的保护代理对有的不保护。
 * 后果实测到过行尾渲出 `…`（tool-summary 硬切劈开代理对）与 diff 面
 * 静默吃掉 3000 字符（edit-hunks 不加省略号）。四种口径各修各的，
 * 迟早再分叉——所以收敛到一处。
 *
 * 口径（三条一次说清，不留给各调用方自己发挥）：
 * 1. **不劈代理对**：末位落在孤立高位代理上时整体舍弃——增补平面字符让位，
 *    绝不产出替换符 `�`。
 * 2. **超限加省略号**：结果长度不超过 `max`（省略号占一位）。不加省略号
 *    等于对用户隐瞒「内容被吃了」，而省略号正是这个信号。
 * 3. `clipAtWord` 在切点够靠后时按词边界切（不劈文件名）；切点回退不到一半
 *    就按码元硬切——回退到半截以下反而丢更多内容，且 CJK 与超长 token 本就
 *    没有词边界，硬切是那里唯一确定的行为。
 */

/** 省略号：单个水平省略字符，宽度与等宽字体的一格一致。 */
const ELLIPSIS = '…';

/**
 * 截断到 `max` 个 UTF-16 码元（含省略号），不劈代理对。
 * 结果长度 ≤ `max`；`max <= 0` 返回空串（上限是非法输入，不该产出整串）。
 */
export function clipText(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  const budget = max - 1; // 给省略号留位
  if (budget <= 0) return ELLIPSIS;
  const cut = text.slice(0, budget);
  const last = cut.charCodeAt(cut.length - 1);
  const loneHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return `${loneHighSurrogate ? cut.slice(0, -1) : cut}${ELLIPSIS}`;
}

/**
 * 按词边界截断到 `max`（含省略号）：切点前回退到最近一个空格/分隔符，
 * 免得把文件名劈成两半。**只在切点够靠后时回退**——否则退到半截以下
 * 反而丢更多内容（无空格的超长 token 就属于这种，硬切才对）。
 * 切点回退不到一半时按码元硬切，行为与 `clipText` 一致。
 */
export function clipAtWord(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  const budget = max - 1;
  if (budget <= 0) return ELLIPSIS;
  const cut = text.slice(0, budget);
  const last = cut.charCodeAt(cut.length - 1);
  // 代理对保护优先于词边界：半个代理项比半个词更糟
  if (last >= 0xd800 && last <= 0xdbff) {
    return `${cut.slice(0, -1)}${ELLIPSIS}`;
  }
  // 从切点往前找最近的空白；切点靠后（有足够内容保留）才回退到词边界
  const boundary = cut.search(/\s$/u);
  if (boundary > 0) {
    const head = cut.slice(0, boundary).replace(/[\s,;]+$/u, '');
    // 回退损失超过一半就硬切：宁可切半个词，也不要只剩个动词
    if (head.length >= budget / 2) return `${head}${ELLIPSIS}`;
  }
  return `${cut}${ELLIPSIS}`;
}
