/** 每行块级嵌套度上限（T56 §2 不变量 3 的护栏）：引用链 + 列表缩进折叠成深度估算，
 * 超限说明是病态嵌套输入（解析器递归会栈溢出炸整屏），调用方直接退纯文本。
 * 阈值远高于真实内容（数十层封顶），远低于崩溃阈值（RN 实测约 9000 层引用链）。 */
const maxNestingDepth = 300;

export function isNestingTooDeep(source: string): boolean {
  for (const line of source.split('\n')) {
    const quotePrefix = /^[ \t]*(?:>[ \t]?)+/.exec(line)?.[0] ?? '';
    const quotes = quotePrefix.split('>').length - 1;
    const indent = /^[ \t]*/.exec(line)?.[0].replace(/\t/g, '  ').length ?? 0;
    if (quotes + Math.floor(indent / 2) + 1 > maxNestingDepth) return true;
  }
  return false;
}
