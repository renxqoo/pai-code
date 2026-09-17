import type { HubFrame } from '@paiapp/contracts';

/**
 * stdout 帧解码器：LF 是唯一记录分隔符（U+2028/U+2029 是 JSON 字符串内容，
 * 不得断行；因此不能用按行读取的宿主 API，必须自行按 \n 切）。
 * 单行超过上限整行丢弃并上报（host-hub 侧 client→host 按 16 MiB 字节计，
 * 此处按字符数防御，量级等价）。
 */

const DEFAULT_MAX_LINE_CHARS = 16 * 1024 * 1024;

export interface FrameDecoderOptions {
  /** 单行字符数上限（默认 16 MiB）。 */
  maxLineChars?: number;
  /** 整行丢弃/解析失败回调（诊断用；解码继续）。 */
  onDropped?: (reason: string) => void;
}

export interface FrameDecoder {
  /** 喂入 stdout chunk（任意切分）；按 \n 完整行回调。 */
  push(chunk: string): void;
  /** 流结束时处理残留缓冲（无换行的尾巴行）。 */
  finish(): void;
}

/** 帧分类：合法形状返回收窄的帧，垃圾输入返回 null（reason 说明）。 */
export function classifyFrame(value: unknown): { frame: HubFrame } | { reason: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { reason: 'frame_not_object' };
  }
  const type = (value as Record<string, unknown>)['type'];
  if (typeof type !== 'string') {
    return { reason: 'frame_type_missing' };
  }
  const obj = value as Record<string, unknown>;
  try {
    return classifyKnown(obj, type);
  } catch {
    return { reason: `frame_payload_invalid:${type}` };
  }
}

function classifyKnown(obj: Record<string, unknown>, type: string): { frame: HubFrame } | { reason: string } {
  switch (type) {
    case 'response':
      return { frame: { type: 'response', id: optString(obj.id), command: reqString(obj.command), success: obj.success === true, data: obj.data, error: optString(obj.error) } };
    case 'event':
      return { frame: { type: 'event', threadId: reqString(obj.threadId), name: reqString(obj.name), payload: requirePayload(obj.payload), ...(obj.agentName !== undefined ? { agentName: reqString(obj.agentName) } : {}) } };
    case 'ui_request':
      return { frame: { type: 'ui_request', requestId: reqString(obj.requestId), threadId: reqString(obj.threadId), method: optString(obj.method), ...(obj.agentName !== undefined ? { agentName: reqString(obj.agentName) } : {}), ...restFields(obj, ['type', 'requestId', 'threadId', 'method', 'agentName']) } };
    case 'heartbeat':
      return { frame: { type: 'heartbeat', rssBytes: optNumber(obj.rssBytes), cpuPercent: optNumber(obj.cpuPercent) } };
    case 'hub_error':
      return { frame: { type: 'hub_error', threadId: optString(obj.threadId), message: reqString(obj.message) } };
    case 'thread_died':
      return { frame: { type: 'thread_died', threadId: reqString(obj.threadId), reason: reqString(obj.reason) } };
    case 'thread_parked': {
      const reason = obj.reason;
      if (reason !== 'idle' && reason !== 'manual' && reason !== 'rss') throw new Error('thread_parked_reason_invalid');
      return { frame: { type: 'thread_parked', threadId: reqString(obj.threadId), reason } };
    }
    default:
      return { reason: `frame_type_unknown:${type}` };
  }
}

function reqString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 事件载荷防线：非对象视为垃圾帧（下游映射器据此免于崩溃）。 */
function requirePayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('event_payload_invalid');
}

function optNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** ui_request 允许透传任意扩展字段（confirm 载荷平铺在帧上：tool/summary/reason）。 */
function restFields(obj: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!known.includes(key)) rest[key] = value;
  }
  return rest;
}

export function createFrameDecoder(onFrame: (frame: HubFrame) => void, options: FrameDecoderOptions = {}): FrameDecoder {
  const maxLineChars = options.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  let buffer = '';
  /** 已扫描偏移：半行堆积时只对新增部分找 \n（均摊 O(1)，避免全量重扫的超线性放大）。 */
  let scanned = 0;
  /** 超限行的丢弃态：丢弃到下一个 \n 为止，避免把残余尾巴误当新行。 */
  let discarding = false;

  const handleLine = (line: string): void => {
    // hub 以 \n 收行；防御 Windows 编辑器写出的 \r 尾
    const text = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (text.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      options.onDropped?.('line_not_json');
      return;
    }
    const result = classifyFrame(parsed);
    if ('frame' in result) {
      onFrame(result.frame);
    } else {
      options.onDropped?.(result.reason);
    }
  };

  const enterDiscarding = (): void => {
    discarding = true;
    buffer = '';
    scanned = 0;
    options.onDropped?.('line_too_long');
  };

  return {
    push(chunk: string): void {
      // 丢弃态不累积数据（超限行剩余部分直接丢弃，内存峰值 = 上限本身）
      if (discarding) {
        const newline = chunk.indexOf('\n');
        if (newline === -1) return;
        discarding = false;
        buffer = chunk.slice(newline + 1);
        scanned = 0;
      } else {
        buffer += chunk;
        // 超限提前判定：基线是「未完成行起点」（scanned），跨 chunk 无换行堆积
        // 同样累积计数——基线若重置为整个尾巴，无换行小 chunk 流可无限增长
        if (buffer.length - scanned > maxLineChars) {
          enterDiscarding();
          return;
        }
      }
      // 行提取用偏移游标推进、chunk 处理完一次性压缩尾巴：单 chunk 含 k 行时
      // 复制成本从 O(k×chunk) 降为每 chunk 一次（流式高频小 delta 帧是热路径）
      let start = scanned;
      for (;;) {
        const index = buffer.indexOf('\n', scanned);
        if (index === -1) break;
        const line = buffer.slice(start, index);
        start = index + 1;
        scanned = start;
        if (line.length > maxLineChars) {
          options.onDropped?.('line_too_long');
          continue;
        }
        handleLine(line);
      }
      if (start > 0) buffer = buffer.slice(start);
      // 压缩后未完成行从 0 起——scanned 归零即「未完成行起点」，供下一 chunk
      // 的超限判定与搜索使用（未完成尾巴每 chunk 重扫一次 indexOf，尾巴长度
      // 受 maxLineChars 上限约束）
      scanned = 0;
    },
    finish(): void {
      const tail = buffer;
      buffer = '';
      scanned = 0;
      if (discarding) {
        // 丢弃在 enterDiscarding 时已上报，这里只复位
        discarding = false;
        return;
      }
      if (tail.length === 0) return;
      // 尾巴超限在 push 的提前判定已不可能（未完成行以 scanned 为基线持续受检，
      // 压缩后尾巴长度 ≤ 上限恒成立）——无需重复防线
      handleLine(tail);
    },
  };
}
