/**
 * 网关 owner 应答协议镜像：真相源 = x-harness 仓库 apps/hub-gateway/src/
 * owner-dispatch.ts（gw 族）与 main.ts submitCommand（host 透传族）。
 *
 * 失败面 error 恒为 commandError(code, message?) 对象——message 可缺席（如
 * owner-only / scope-denied 判定）。host 透传命令的 error 经 readCommandError
 * 收窄，解码失败时缺席（undefined）——error 缺失是线上真实形态，不是异常。
 */

/** 网关命令失败码闭集（gw-command-failed 之外是 Electron 管道合成终局）。 */
export const GATEWAY_OWNER_FAILURE_CODES = [
  'gw-command-failed',
  'gateway-not-configured',
  'gateway-not-connected',
  'gateway-exited',
  'gateway-timeout',
] as const;
export type GatewayOwnerFailureCode = (typeof GATEWAY_OWNER_FAILURE_CODES)[number];

/** 线上错误形状（x-harness remote-protocol commandError 的镜像）。 */
export interface GatewayCommandError {
  code: string;
  message?: string;
}

/** 线上错误形状守卫（不校验码表成员——新版本网关的未登记 code 原样透传）。 */
export function readGatewayCommandError(value: unknown): GatewayCommandError | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const code = record['code'];
  if (typeof code !== 'string' || code.length === 0) return null;
  const message = record['message'];
  return typeof message === 'string' ? { code, message } : { code };
}

/** 失败原因单一真相：message 优先、code 兜底（渲染层只消费这一种字符串）。 */
export function gatewayFailureReason(error: GatewayCommandError): string {
  return error.message !== undefined && error.message.length > 0 ? error.message : error.code;
}

export type GatewayOwnerResponse =
  | { ok: true; data: unknown }
  | { ok: false; reason: string };

/**
 * owner 应答收窄：success 非布尔或应答非对象 → null（调用方按无应答处理）。
 * 失败时 error 缺失/垃圾形状 → reason 落 'gw-command-failed' 兜底（垃圾输入降级）。
 */
export function readGatewayOwnerResponse(body: unknown): GatewayOwnerResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (record['success'] !== true && record['success'] !== false) return null;
  if (record['success'] === true) return { ok: true, data: record['data'] ?? null };
  const error = readGatewayCommandError(record['error']);
  return { ok: false, reason: error !== null ? gatewayFailureReason(error) : 'gw-command-failed' };
}
