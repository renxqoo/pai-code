/**
 * host-hub 协议镜像（v1）。
 *
 * 同步纪律：本文件是外部仓库 host-hub（x-harness 仓库/packages/host-hub）
 * 协议面的镜像抄录，不引入运行时依赖。规格真相源 = x-harness 仓库
 * `src/protocol/commands.ts`（COMMAND_NAMES）与 `src/protocol/frames.ts`；
 * 载荷形状以其各 handler 实现为准。协议变更时，先走 x-harness 仓库流程定稿，
 * 再在同一提交内更新本文件与 `__test__` 的词表断言。
 */

/** 内核会话事件的宽松镜像（get_entries 的 event 载荷）：字段收窄由 adapter 负责。 */
export type WalEvent = { type: string } & Record<string, unknown>;

export interface ImagePayload {
  type: 'image';
  data: string;
  mediaType: string;
}

// ============================================================================
// Frames (stdout <- host-hub)
// ============================================================================

export interface ResponseFrame {
  type: 'response';
  id?: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 事件帧：payload 展开（无 event 嵌套）；agentName 仅子代理中继时存在。
 *  name 是开放字符串（host-hub 前向演进新增事件名须能透传到「忽略」策略）。 */
export interface EventFrame {
  type: 'event';
  threadId: string;
  name: string;
  payload: Record<string, unknown>;
  agentName?: string;
}

export interface UiRequestFrame {
  type: 'ui_request';
  requestId: string;
  threadId: string;
  /** 对话框方法：host-hub 仅实现 confirm。 */
  method?: string;
  /** 子代理中继的对话框身份。 */
  agentName?: string;
  [key: string]: unknown;
}

/** host 心跳 1Hz（worker 心跳是 host→worker 内部帧，不外发）。 */
export interface HeartbeatFrame {
  type: 'heartbeat';
  rssBytes?: number;
  cpuPercent?: number;
}

export interface HubErrorFrame {
  type: 'hub_error';
  /** worker 内异常时标识线程。 */
  threadId?: string;
  message: string;
}

/** worker 异常死亡；线程表转 dead，下条命令自动恢复。 */
export interface ThreadDiedFrame {
  type: 'thread_died';
  threadId: string;
  reason: string;
}

/** worker 被收编（闲置 sweep / 手动 retire / RSS 处置），表项转 parked、会话文件保留。 */
export interface ThreadParkedFrame {
  type: 'thread_parked';
  threadId: string;
  reason: 'idle' | 'manual' | 'rss';
}

export type HubFrame =
  | ResponseFrame
  | EventFrame
  | UiRequestFrame
  | HeartbeatFrame
  | HubErrorFrame
  | ThreadDiedFrame
  | ThreadParkedFrame;

/** 帧词表（与 host-hub frames.ts 逐一对应；测试做封闭断言）。 */
export const HUB_FRAME_TYPES = [
  'response',
  'event',
  'ui_request',
  'heartbeat',
  'hub_error',
  'thread_died',
  'thread_parked',
] as const;



// 编译期封闭断言：词表与类型联合双向绑定（漂移即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _hubFramesCover = null as unknown as CoversUnion<HubFrame['type'], (typeof HUB_FRAME_TYPES)[number]>;
void _hubFramesCover;
