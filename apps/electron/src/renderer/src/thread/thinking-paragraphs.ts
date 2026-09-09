/**
 * 思考全文按空行拆段：原文的 \n\n 分段若直接交给 whitespace-pre-wrap 会渲染成整行空行，
 * 段间距失控；拆成段列表后由视图用显式间距渲染。段内单换行保留原貌。
 * 垃圾输入（空串/全空白）降级为空数组。
 */

export function thinkingParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
