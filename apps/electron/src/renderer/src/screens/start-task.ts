import type { ComposerAttachment } from '@/composer/prompt-card';

/** 新建任务提交面（渲染层内部形状，图片载荷转换由接线层负责）。 */
export type NewTaskStart = {
  cwd: string
  trusted: boolean
  /** `provider/modelId` */
  model: string
  /** null = 不干预（hub 按 settings 缺省） */
  permissionMode: string | null
  /** 思考档（协议档位值；null = 跟随缺省） */
  thinkingLevel: string | null
  text: string
  attachments: readonly ComposerAttachment[]
};

export type StartTaskDeps = {
  onCreate: (input: NewTaskStart) => Promise<boolean>
};

/**
 * 新建任务提交链：建会话 → 投首条消息（动作层负责）。resolve true = 会话已建
 * （调用方关页）。
 */
export async function startTask(input: NewTaskStart, deps: StartTaskDeps): Promise<boolean> {
  return deps.onCreate(input);
}
