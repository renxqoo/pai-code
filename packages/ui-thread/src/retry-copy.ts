/**
 * 重试行文案的共享派生层（注入面）：整句拼装（序号 + 分隔符 + 原因）只在这里
 * 定义一次，两端（PC / 移动端）同一句话，不出现分隔符空格漂移。词表由两端
 * strings 适配层按语言提供——共享包不 import 任何一端的 strings。
 */

/** hub 可重试错误码 → 原因短语（x-harness llm-retry：http-408/429/500/502/503/504、
 *  network，外加 repetition——本部署 llm-repetition-guard 的重复输出守卫码）。
 *  未知码落 fallback 短语；null（帧无 code）同样落 fallback。 */
export type RetryCopy = {
  reasonHttp429: string;
  reasonHttp408: string;
  reasonHttp5xx: string;
  reasonNetwork: string;
  reasonRepetition: string;
  reasonFallback: string;
  /** 重试序号词面（attempt 为重试序号） */
  retryingLabel: (attempt: number) => string;
};

const RETRYABLE_HTTP_5XX: ReadonlySet<string> = new Set(['http-500', 'http-502', 'http-503', 'http-504']);

export function retryReasonLabel(code: string | null, copy: RetryCopy): string {
  if (code === 'http-429') return copy.reasonHttp429;
  if (code === 'http-408') return copy.reasonHttp408;
  if (code === 'network') return copy.reasonNetwork;
  if (code === 'repetition') return copy.reasonRepetition;
  if (code !== null && RETRYABLE_HTTP_5XX.has(code)) return copy.reasonHttp5xx;
  return copy.reasonFallback;
}

/** 重试行整句（序号 + 原因）：分隔符与措辞单点拼装。 */
export function retryLineOf(attempt: number, code: string | null, copy: RetryCopy): string {
  return `${copy.retryingLabel(attempt)} · ${retryReasonLabel(code, copy)}`;
}
