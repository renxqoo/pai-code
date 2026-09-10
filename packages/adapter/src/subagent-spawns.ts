import type { SubagentSpawnView } from '@paiapp/contracts';

import { clip } from './args-preview';

/**
 * task 工具参数 → 子代理执行清单：single {agent, task} / parallel {tasks[]} /
 * chain {chain[]} 统一展开为执行项数组（hub TaskItem 恒含 agent+task，此处宽容降级）。
 * 其余工具或垃圾形状返回空数组；文本沿用预览域归一（空白折叠 + 截断）。
 */

const TASK_TOOL = 'task';
/** 数组模式字段：tasks（parallel）优先于 chain，与 hub PreparedBatch 的模式判定同序（空数组不成立）。 */
const LIST_FIELDS = ['tasks', 'chain'] as const;

export function subagentSpawnsOf(name: string, args: Record<string, unknown>): SubagentSpawnView[] {
  if (name.trim().toLowerCase() !== TASK_TOOL) return [];
  return spawnItems(args)
    .map((item) => ({ agent: clip(textOf(item['agent'])), task: clip(textOf(item['task'])) }))
    .filter((item) => item.agent.length > 0 || item.task.length > 0);
}

/** 工具调用视图的 subagents 字段：展开为空时不携带（wire 精简，与「其余工具不携带」契约一致）。 */
export function subagentsField(
  name: string,
  args: Record<string, unknown>,
): { subagents?: SubagentSpawnView[] } {
  const spawns = subagentSpawnsOf(name, args);
  return spawns.length > 0 ? { subagents: spawns } : {};
}

/** 参数形状收窄：tasks/chain 非空数组按元素展开（非对象元素丢弃），否则按 single 把参数整体视为一项。
 * 空数组不算数组模式——hub 的模式判定是「长度 > 0 才成立」，此时 single 字段照常派生。 */
function spawnItems(args: Record<string, unknown>): Array<Record<string, unknown>> {
  for (const field of LIST_FIELDS) {
    const list = args[field];
    if (Array.isArray(list) && list.length > 0) {
      return list.filter(
        (item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    }
  }
  return [args];
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
