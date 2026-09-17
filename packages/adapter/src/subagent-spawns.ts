import type { SubagentSpawnView } from '@paiapp/contracts';

import { clip } from './args-preview';

/**
 * agent 委派工具参数 → 子代理执行清单。内核 agent 工具入参
 * {prompt, subagent_type?, name?, work?} 单发形态：agent = 类型/显示名，
 * task = prompt（自包含任务文本）。其余工具或垃圾形状返回空数组。
 */

const AGENT_TOOL = 'agent';

export function subagentSpawnsOf(name: string, args: Record<string, unknown>): SubagentSpawnView[] {
  if (name.trim().toLowerCase() !== AGENT_TOOL) return [];
  const type = clip(textOf(args['subagent_type']));
  const display = clip(textOf(args['name']));
  const prompt = clip(textOf(args['prompt']));
  const agent = type.length > 0 ? type : display.length > 0 ? display : 'agent';
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
