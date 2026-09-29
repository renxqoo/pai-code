/**
 * 在途乐观回显登记（threadId 键控，**FIFO**）：submitDraft 插入 pending 气泡时入队，
 * 权威气泡到达时按序认领（WAL seq 单调 ⇒ 到达序 = 提交序，取队首即最近未认领的），
 * 投递失败时按 localId 精确出队回滚。
 * 同线程连投虽由 composer 的 sendingRef 闸拦截，但仍以队列承载——队列语义无「只留最近
 * 一条」的隐含假设（那会让第二条权威气泡去认领第一条的气泡）。
 */
export const pendingEchoes = new Map<string, Array<{ localId: string; text: string }>>();
