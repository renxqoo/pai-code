import type { SubagentSpawnView } from '@paiapp/contracts';

import { clip } from './args-preview';

/**
 * 子代理委派工具参数 → 子代理执行清单。x-harness agent_spawn 工具入参
 * {description, prompt, subagent_type?, model?, isolation?} 单发形态：
 * agent = 类型名（回退 description 摘要），task = prompt（自包含任务文本）。
 * 其余工具或垃圾形状返回空数组。
 */

const AGENT_SPAWN_TOOL = 'agent_spawn';

export function subagentSpawnsOf(name: string, args: Record<string, unknown>): SubagentSpawnView[] {
  if (name.trim().toLowerCase() !== AGENT_SPAWN_TOOL) return [];
  const type = clip(textOf(args['subagent_type']));
  const description = clip(textOf(args['description']));
  const prompt = clip(textOf(args['prompt']));
  const agent = type.length > 0 ? type : description.length > 0 ? description : 'agent';
  if (prompt.length === 0 && agent === 'agent') return [];
  return [{ agent, task: prompt }];
}

/** 工具调用视图的 subagents 字段：展开为空时不携带（wire 精简，与「其余工具不携带」契约一致）。 */
export function subagentsField(
  name: string,
  args: Record<string, unknown>,
): { subagents?: SubagentSpawnView[] } {
  const spawns = subagentSpawnsOf(name, args);
  return spawns.length > 0 ? { subagents: spawns } : {};
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
