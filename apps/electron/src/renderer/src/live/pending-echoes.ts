/**
 * 在途乐观回显登记（threadId 键控，最近一条）：submitDraft 插入 pending 气泡时登记，
 * 权威气泡到达（live-controller 替换）或投递失败（回滚）时消费。
 * 单线程单在途——同线程连投由 composer 的 sendingRef 闸拦截。
 */
export const pendingEchoes = new Map<string, { localId: string; text: string }>();
