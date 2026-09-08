/**
 * 单行预览：取首个非空行，压平空白并按长度截断（收起态思考摘要等单行场景共用）。
 * 垃圾输入（空串/全空白）降级为空串。
 */

const PREVIEW_LIMIT = 120;

export function previewLine(text: string): string {
  const first = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const single = first.replace(/\s+/g, ' ').trim();
  return single.length > PREVIEW_LIMIT ? `${single.slice(0, PREVIEW_LIMIT - 1)}…` : single;
}
