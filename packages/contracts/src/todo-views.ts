import { z } from 'zod';

/**
 * todo 清单视图（x-harness todo-tools 域）：`todo/snapshot` 全量快照是速览面板
 * 进程区的唯一数据源（last-wins 语义——后到快照整体替换）；todo 工具调用在对话流
 * 零痕迹（渲染条目过滤的词表真相在本模块）。
 */

/** 任务状态三值闭包（x-harness TodoSnapshotTaskData.status；deleted 为物理移除，不进快照）。 */
export const TodoTaskStatusSchema = z.enum(['pending', 'in_progress', 'completed']);
export type TodoTaskStatus = z.infer<typeof TodoTaskStatusSchema>;

/** todo 快照内单任务。 */
export const TodoSnapshotTaskSchema = z.object({
  /** 十进制规范形非空串（x-harness 词条门同规——空/重复 id 会破列表 key） */
  id: z.string().min(1),
  subject: z.string(),
  status: TodoTaskStatusSchema,
  description: z.string().optional(),
  activeForm: z.string().optional(),
  /** 归属 agent 名（x-harness TodoSnapshotTaskData.owner）。 */
  owner: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TodoSnapshotTask = z.infer<typeof TodoSnapshotTaskSchema>;

/** todo 清单全量快照（seq = 桶计数器；edges = [blocker, blocked] 依赖边展平）。 */
export const TodoSnapshotEventDataSchema = z.object({
  seq: z.number().int(),
  tasks: z.array(TodoSnapshotTaskSchema),
  edges: z.array(z.tuple([z.string(), z.string()])),
});
export type TodoSnapshotEventData = z.infer<typeof TodoSnapshotEventDataSchema>;

/** todo 清单工具词表（x-harness todo-tools 注册名）：对话流渲染条目过滤的封闭词表。 */
export const TODO_TOOL_NAMES = ['task_create', 'task_get', 'task_list', 'task_update'] as const;

/** 工具名是否 todo 清单工具（大小写不敏感——与工具归类同规）。 */
export function isTodoTool(name: string): boolean {
  const lowered = name.trim().toLowerCase();
  return (TODO_TOOL_NAMES as readonly string[]).includes(lowered);
}
