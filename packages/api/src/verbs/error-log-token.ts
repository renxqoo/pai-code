import type { ApiError } from '@paiapp/contracts';

/**
 * 诊断日志 token（api-routes 族失败落日志用）：kind 为干（transient 细分 face、
 * unregistered_code 细分 code——kind 本身无区分度），message 取首行截断拼接，
 * 保留可 grep 的失败签名不折平。
 */

export function errorLogToken(error: ApiError): string {
  const head =
    error.kind === 'transient'
      ? `transient:${error.face}`
      : error.kind === 'unregistered_code'
        ? `unregistered_code:${error.code}`
        : error.kind;
  const firstLine = error.message?.split('\n')[0] ?? '';
  return firstLine.length === 0 ? head : `${head}:${firstLine.slice(0, 120)}`;
}
