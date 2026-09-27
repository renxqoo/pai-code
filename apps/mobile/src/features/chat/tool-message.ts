import type { EditHunkView, SubagentSpawnView, ToolCallStatus } from '@paiapp/contracts';

import type { ChatMessage } from '@/types/domain';

/**
 * ChatMessage（tool 行）→ 共享派生层的最小输入面：模型适配裁决——移动端不换
 * 领域模型，只把执行字段映射成 @paiapp/ui-thread 认的结构化形状（名称/状态/
 * 参数/输出〔正文 text〕/补丁/子代理），两端同一套派生逻辑都吃这个形状。
 * 垃圾输入（缺字段的 tool 消息）降级为中性默认值，不崩不悬空。
 */
export type ToolView = {
  name: string;
  status: ToolCallStatus;
  argsPreview: string;
  output: string;
  exitCode: number | null;
  durationMs: number | null;
  editHunks: readonly EditHunkView[];
  subagents: readonly SubagentSpawnView[];
};

export function toolViewOf(message: ChatMessage): ToolView {
  return {
    name: message.toolName ?? '',
    status: message.status ?? 'ok',
    argsPreview: message.argsPreview ?? '',
    output: message.text,
    exitCode: message.exitCode ?? null,
    durationMs: message.durationMs ?? null,
    editHunks: message.editHunks ?? [],
    subagents: message.subagents ?? [],
  };
}
