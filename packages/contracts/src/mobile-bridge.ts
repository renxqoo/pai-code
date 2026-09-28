/**
 * mobile bridge 线格式（T57 §3）：手机 App ↔ 桌面端 mobile-bridge 的 WebSocket 帧。
 * 上行 = 手机→桌面（pair/auth/invoke/ack/ping）；下行 = 桌面→手机（paired/invokeResult/event/pong）。
 * zod 单点校验：bridge 服务端逐帧 parse，垃圾输入整帧丢弃并计数（不崩连接）。
 */
import { z } from 'zod';

/** ApiError 判别联合的 zod 镜像（TS 类型在 hub-errors；此处线格式校验用）。
 * kind 开集（unregistered_code.code / transient.face / app code……）——
 * 形状守卫：kind 必须 string，其余字段透传（新错误种类不被旧桥丢弃）。 */
const ApiErrorWireSchema = z.object({ kind: z.string().min(1) }).passthrough();

// ---------------------------------------------------------------------------
// 上行帧（手机 → 桌面）
// ---------------------------------------------------------------------------

/** 配对：6 位数字码（桌面端 UI 展示；TTL 5min、一次性、5 次失败锁定 5min）。 */
export const BridgePairFrameSchema = z
  .object({
    type: z.literal('pair'),
    code: z.string().regex(/^\d{6}$/),
    /** 设备展示名（设置-关于手机可见；用于桌面端连接列表）。 */
    deviceName: z.string().min(1).max(64),
  })
  .strict();

/** 鉴权：配对签发的令牌。 */
export const BridgeAuthFrameSchema = z.object({ type: z.literal('auth'), token: z.string().min(1) }).strict();

/** API 调用：method 在 ApiSchemas（路由侧 zod 二次校验）；id 手机侧唯一关联响应。 */
export const BridgeInvokeFrameSchema = z
  .object({
    type: z.literal('invoke'),
    id: z.string().min(1).max(128),
    method: z.string().min(1),
    params: z.unknown(),
  })
  .strict();

/** 事件确认：收到 event.seq（服务端按水位丢弃已确认缓冲）。 */
export const BridgeAckFrameSchema = z.object({ type: z.literal('ack'), seq: z.number().int().nonnegative() }).strict();

export const BridgePingFrameSchema = z.object({ type: z.literal('ping') }).strict();

export const BridgeClientFrameSchema = z.discriminatedUnion('type', [
  BridgePairFrameSchema,
  BridgeAuthFrameSchema,
  BridgeInvokeFrameSchema,
  BridgeAckFrameSchema,
  BridgePingFrameSchema,
]);
export type BridgeClientFrame = z.infer<typeof BridgeClientFrameSchema>;

// ---------------------------------------------------------------------------
// 下行帧（桌面 → 手机）
// ---------------------------------------------------------------------------

/** 服务端身份（设备列表展示 + 版本对齐检查）。 */
export const BridgeServerInfoSchema = z
  .object({ appVersion: z.string(), hostPhase: z.enum(['starting', 'ready', 'restarting', 'failed']).nullable() })
  .strict();
export type BridgeServerInfo = z.infer<typeof BridgeServerInfoSchema>;

export const BridgePairedFrameSchema = z
  .object({ type: z.literal('paired'), token: z.string().min(1), serverInfo: BridgeServerInfoSchema })
  .strict();

export const BridgePairFailedFrameSchema = z.object({ type: z.literal('pairFailed'), reason: z.string() }).strict();

export const BridgeAuthFailedFrameSchema = z.object({ type: z.literal('authFailed'), reason: z.string() }).strict();

export const BridgeReadyFrameSchema = z.object({ type: z.literal('ready'), serverInfo: BridgeServerInfoSchema }).strict();

/** invoke 应答：ok 判别（data 直传 ApiData；error = ApiError）。 */
export const BridgeInvokeResultFrameSchema = z
  .object({
    type: z.literal('invokeResult'),
    id: z.string().min(1),
    ok: z.boolean(),
    data: z.unknown().optional(),
    error: ApiErrorWireSchema.optional(),
  })
  .strict();

/** 事件推送：seq 单调（重连按 ack 水位续传缺口的权威依据）。 */
export const BridgeEventFrameSchema = z
  .object({ type: z.literal('event'), seq: z.number().int().nonnegative(), event: z.unknown() })
  .strict();

export const BridgePongFrameSchema = z.object({ type: z.literal('pong') }).strict();

export const BridgeServerFrameSchema = z.discriminatedUnion('type', [
  BridgePairedFrameSchema,
  BridgePairFailedFrameSchema,
  BridgeAuthFailedFrameSchema,
  BridgeReadyFrameSchema,
  BridgeInvokeResultFrameSchema,
  BridgeEventFrameSchema,
  BridgePongFrameSchema,
]);
export type BridgeServerFrame = z.infer<typeof BridgeServerFrameSchema>;

// ---------------------------------------------------------------------------
// 桥常量（两端共用单一真相）
// ---------------------------------------------------------------------------

export const BRIDGE_DEFAULT_PORT = 8787;
export const BRIDGE_PAIR_CODE_TTL_MS = 5 * 60 * 1000;
export const BRIDGE_PAIR_MAX_ATTEMPTS = 5;
export const BRIDGE_PAIR_LOCKOUT_MS = 5 * 60 * 1000;
/** 事件环形缓冲上限（重连续传窗口；超出丢最旧——客户端以 entries 水化兜底）。 */
export const BRIDGE_EVENT_BUFFER_LIMIT = 2000;
