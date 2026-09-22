import { z } from 'zod';

/**
 * 排队条目（hub inbox entry 投影，api 与 ui-events 共用叶子形状——
 * 放叶子模块防两文件互相导入成环）。
 */
export const queueEntry = z.object({ id: z.string(), text: z.string() }).strict();
export type QueueEntry = z.infer<typeof queueEntry>;
