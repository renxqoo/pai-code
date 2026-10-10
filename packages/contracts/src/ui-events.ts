import { z } from 'zod';

import { queueEntry } from './queue-views';
import { TodoSnapshotEventDataSchema } from './todo-views';
import { UsageSchema } from './usage';

/**
 * 渲染层事件词表：adapter 把 host-hub 帧折叠成这些正规化事件，
 * 渲染层只认识本词表，永不接触协议字面量。
 * 同线程事件有序；跨线程无序保证。
 */

/** 图片载荷（发送参数与历史条目共用形状；data 为无前缀 base64）。zod 形态对应
 *  `ImagePayload`（hub-protocol，协议传输形状）——两域各持一份，此处供视图 schema 复用。 */
export const imagePayload = z
  .object({
    type: z.literal('image'),
    data: z.string().min(1),
    mediaType: z.string().min(1),
  })
  .strict();

/** task 工具参数展开出的子代理执行项（agent 名与任务描述分列展示）。 */
export const SubagentSpawnViewSchema = z.object({
  agent: z.string(),
  task: z.string(),
});
export type SubagentSpawnView = z.infer<typeof SubagentSpawnViewSchema>;

/** edit 工具参数展开出的补丁片段（一次精确文本替换的一对原文/新文）。
 *  path 是归并主键：模型常对同一文件多次调用 edit，渲染层据此把多次编辑
 *  合成一个 diff（一个文件一个 diff，GitHub 形态），而不是按调用拆成多块。 */
export const EditHunkViewSchema = z.object({
  /** 被替换的原文片段 */
  oldText: z.string(),
  /** 替换后的新文片段 */
  newText: z.string(),
  /** 被编辑的文件路径（工具入参 path；'' = 未知，归并时各自成块） */
  path: z.string(),
});
export type EditHunkView = z.infer<typeof EditHunkViewSchema>;

export const ToolCallViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  argsPreview: z.string(),
  /** task 工具的子代理执行清单（single/parallel/chain 统一展开）；其余工具不携带。 */
  subagents: z.array(SubagentSpawnViewSchema).optional(),
  /** edit 工具的补丁片段（精确文本替换的原文/新文对）；其余工具不携带。 */
  editHunks: z.array(EditHunkViewSchema).optional(),
});
export type ToolCallView = z.infer<typeof ToolCallViewSchema>;

/** 工具调用的展示状态词表：渲染层状态机派生（运行中标记 / 退出码 / 中止信号），
 *  非零退出必须能区别于成功。执行行状态前缀与批次聚合态都以此为准。 */
export type ToolCallStatus = 'running' | 'ok' | 'failed' | 'stopped';

/** 文件变更视图（edit/write 工具的展示形态；write 的 deletions 恒 0，基线不可得）。 */
export const DiffFileViewSchema = z.object({
  path: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
});
export type DiffFileView = z.infer<typeof DiffFileViewSchema>;

/** 会话表行（thread/list、start/resume 响应、状态变化的单一形状）。 */
export const SessionViewSchema = z.object({
  threadId: z.string(),
  cwd: z.string(),
  /** null = 会话文件尚未落盘（首条消息前）。 */
  sessionPath: z.string().nullable(),
  title: z.string(),
  state: z.enum(['live', 'parked', 'dead']),
  streaming: z.boolean(),
  /** 展示名（provider/modelId）；null = 未知。 */
  model: z.string().nullable(),
  thinkingLevel: z.string().nullable(),
  /** 会话最后活动时间（新建/fork/turn 推进；选中/恢复/改名不推进）——相对时间标签的依据。 */
  lastActivityAt: z.number(),
  /** 会话创建时刻（注册表行 createdAt；无行回退 lastActivityAt）——侧栏排序的唯一依据。 */
  createdAt: z.number(),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

const threadId = z.string();

const uiEventDefs = {
  /** host 进程相位：starting（spawn 后）→ ready（首个心跳）→ restarting（挂死重启）| failed（重启放弃）。 */
  host: z.object({ type: z.literal('host'), phase: z.enum(['starting', 'ready', 'restarting', 'failed']) }),
  sessionUpdated: z.object({ type: z.literal('sessionUpdated'), session: SessionViewSchema }),
  sessionRemoved: z.object({ type: z.literal('sessionRemoved'), threadId }),
  /** worker 异常死亡（自动恢复中，UI 呈横幅提示）。 */
  sessionDied: z.object({ type: z.literal('sessionDied'), threadId, reason: z.string() }),
  /** worker 被收编（闲置 sweep / 手动 retire / RSS 处置），会话转 parked、发消息自动唤醒。 */
  sessionParked: z.object({ type: z.literal('sessionParked'), threadId, reason: z.enum(['idle', 'manual', 'rss']) }),

  /** 一轮开始（turn/start；后台任务通知唤起的回合同样触发）。 */
  turnStarted: z.object({ type: z.literal('turnStarted'), threadId, at: z.number() }),
  /** 用户角色消息：本地 prompt 回显或系统注入（task-notification / task-message）。
   *  seq = 该落账的 WAL 行号，与条目对账（`seq-<seq>`）**同一身份域**——同一句话
   *  经事件帧与转写两路到达时按 id 去重，不必靠文本比对（见 fold-events）。
   *  claimedIds = 帧内用户输入的 inbox 条目 id（按序；内核仅标记 prompt/
   *  followup/steer 物化物）：乐观回显按 id 精准配对收敛（双队列认领序 ≠ 提交序，
   *  FIFO 只作旧 hub 兼容兑底）。userBlocks = 旧 hub 兼容字段（块数兑底）。 */
  userMessage: z.object({
    type: z.literal('userMessage'),
    threadId,
    message: z.object({ seq: z.number(), text: z.string(), origin: z.enum(['user', 'system']), images: z.array(imagePayload), claimedIds: z.array(z.string()).optional(), userBlocks: z.number().int().positive().max(64).optional() }),
  }),
  messageStarted: z.object({ type: z.literal('messageStarted'), threadId, messageId: z.string(), at: z.number() }),
  /** 流式正文增量：只拼 delta，权威内容见 messageFinal。 */
  textDelta: z.object({ type: z.literal('textDelta'), threadId, messageId: z.string(), delta: z.string() }),
  thinkingDelta: z.object({ type: z.literal('thinkingDelta'), threadId, messageId: z.string(), delta: z.string() }),
  /** attempt 重开（内核 runAttempt 同 turn/step 内流失败重试）：该消息的流式
   *  text/thinking 块清空重来——新 attempt 从头累积，不与中断残留叠加。 */
  streamRestarted: z.object({ type: z.literal('streamRestarted'), threadId, messageId: z.string() }),
  /** 模型侧工具调用定形（tool/start 携完整参数）；执行进度走 toolUpdated/toolEnded。 */
  toolCallAdded: z.object({
    type: z.literal('toolCallAdded'),
    threadId,
    messageId: z.string(),
    call: ToolCallViewSchema,
    /** write 类工具参数即变更意图，执行前已知；null = 无文件变更视图。 */
    diff: z.array(DiffFileViewSchema).nullable(),
  }),
  toolUpdated: z.object({ type: z.literal('toolUpdated'), threadId, callId: z.string(), output: z.string() }),
  toolEnded: z.object({
    type: z.literal('toolEnded'),
    threadId,
    callId: z.string(),
    output: z.string(),
    isError: z.boolean(),
    durationMs: z.number(),
    /** 文件修改类工具的变更视图；null = 非文件修改。 */
    diff: z.array(DiffFileViewSchema).nullable(),
  }),
  /** 消息定形权威快照（assistant/stream done；流式缓冲以此替换）。 */
  messageFinal: z.object({
    type: z.literal('messageFinal'),
    threadId,
    message: z.object({
      id: z.string(),
      text: z.string(),
      thinking: z.string(),
      toolCalls: z.array(ToolCallViewSchema),
      usage: UsageSchema.nullable(),
    }),
  }),
  /** 回复彻底完成（settled{sendId, ok}）：每次驱动命令恰好一次；worker 死亡由 host 合成 ok:false（无悬挂）。
   *  用户主动停止后的 settle 由渲染层按停止意图标 stopped。 */
  turnSettled: z.object({
    type: z.literal('turnSettled'),
    threadId,
    ok: z.boolean(),
    /** ok=false 时的失败原因（hub/worker 错误文案）；ok=true 缺省。 */
    reason: z.string().optional(),
    usage: UsageSchema.nullable(),
  }),
  queueChanged: z.object({
    type: z.literal('queueChanged'),
    threadId,
    /** hub inbox entry 投影（id 是 queue/drop、queue/send_now 的寻址键） */
    steering: z.array(queueEntry),
    followUp: z.array(queueEntry),
  }),
  /** isStreaming 由 turnStarted/turnSettled 派生（agent 运行窗口），不设独立事件。 */
  compacting: z.object({ type: z.literal('compacting'), threadId, active: z.boolean() }),
  /** 压缩完成事实（compaction 单事件——host-hub 无 start/end 对；active=false 随后必发）。 */
  compacted: z.object({ type: z.literal('compacted'), threadId, replacedCount: z.number().int() }),
  /** auto-retry 进行中（llm/retry）。turn/step 定位被重试的 attempt——同轮多次重试互不覆盖。
   *  mapper 丢弃缺坐标与结算轮水位以下的迟到帧（hub gates 保证线上帧坐标恒在）：
   *  本词表只收真实坐标（非负）。code 与 message 分开传：界面按 code 出人话，
   *  原始报文由界面自行决定是否展示（拼成单串会逼 UI 要么全显示要么全不显示）。 */
  retrying: z.object({
    type: z.literal('retrying'),
    threadId,
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    attempt: z.number().int().positive(),
    code: z.string().nullable(),
    message: z.string().nullable(),
  }),

  subagentStarted: z.object({
    type: z.literal('subagentStarted'),
    threadId,
    agentId: z.string(),
    /** 定义名（x-harness type 字段）——展示键；agentId 是唯一身份。 */
    agentName: z.string(),
    /** 任务摘要（agent/spawned work；空串 = 待 get_subagents 快照回填）。 */
    task: z.string(),
  }),
  /** 子 agent 流式正文增量（agent/assistant-stream 帧 agentName=agentId 分流；累积由渲染层负责）。 */
  subagentDelta: z.object({ type: z.literal('subagentDelta'), threadId, agentId: z.string(), delta: z.string() }),
  subagentTool: z.object({
    type: z.literal('subagentTool'),
    threadId,
    agentId: z.string(),
    call: ToolCallViewSchema,
    phase: z.enum(['start', 'update', 'end']),
    output: z.string().optional(),
    isError: z.boolean().optional(),
  }),
  /** 子 agent 运行周期终结（agent/finished；status = outcome 词表 completed|stopped|failed 原文）。 */
  subagentSettled: z.object({ type: z.literal('subagentSettled'), threadId, agentId: z.string(), status: z.string() }),
  /** 子 agent 忙闲迁移（agent/status running|idle；面板状态徽标的数据源）。 */
  subagentState: z.object({ type: z.literal('subagentState'), threadId, agentId: z.string(), busy: z.boolean() }),

  /** git 分支/refs 变更（hub git/changed——外部 checkout 等的失效信号；branch 键
   *  缺席 = detached 已分离。渲染层按 cwd 匹配会话刷新分支视图——docs/GIT-INTERACTION-REDESIGN §2.1）。 */
  gitChanged: z.object({ type: z.literal('gitChanged'), threadId, cwd: z.string(), branch: z.string().optional() }),

  /** todo 清单全量快照（last-wins：速览面板进程区整体替换）。 */
  todoSnapshot: z.object({ type: z.literal('todoSnapshot'), threadId, snapshot: TodoSnapshotEventDataSchema }),

  dialogRequest: z.object({
    type: z.literal('dialogRequest'),
    threadId,
    requestId: z.string(),
    /** host-hub 仅实现 confirm。 */
    method: z.string(),
    /** confirm 三字段（载荷平铺自 ui_request 帧）。 */
    tool: z.string().optional(),
    summary: z.string().optional(),
    reason: z.string().optional(),
    /** 子代理中继的对话框身份。 */
    agentName: z.string().optional(),
  }),
  dialogSettled: z.object({ type: z.literal('dialogSettled'), requestId: z.string() }),

  /** 直执行 bash 流式输出（payload {id, delta, truncated}；truncated 置位后粘滞）。 */
  bashOutput: z.object({ type: z.literal('bashOutput'), threadId, id: z.string().nullable().optional(), delta: z.string(), truncated: z.boolean().optional() }),
} as const;

/**
 * 判别联合：Object.values 在类型层丢元组性，这里断言非空元组
 * （defs 是 const 非空对象，运行时恒真；样本面测试兜底）。
 */
type UiEventDef = (typeof uiEventDefs)[keyof typeof uiEventDefs];
export const UiEventSchema = z.discriminatedUnion(
  'type',
  Object.values(uiEventDefs) as [UiEventDef, ...UiEventDef[]],
);
export type UiEvent = z.infer<typeof UiEventSchema>;

/** 事件词表（封闭：新增事件必须先改本表，测试双向断言）。 */
export const UI_EVENT_TYPES = Object.keys(uiEventDefs) as readonly (keyof typeof uiEventDefs)[];

// 编译期封闭断言：词表与判别联合双向绑定（漏登记即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _uiEventsCover = null as unknown as CoversUnion<UiEvent['type'], (typeof UI_EVENT_TYPES)[number]>;
void _uiEventsCover;
