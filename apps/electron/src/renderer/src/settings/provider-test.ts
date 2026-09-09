/** 渠道/模型探活结果（IPC provider/test 的 outcome 形状；detail/editor/list/row 共用）。 */
export type ProviderTestResult = { ok: true; latencyMs: number } | { ok: false; reason: string };
