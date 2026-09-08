import type { HubFrame } from '@paiapp/contracts';

/**
 * stdout 帧解码器：LF 是唯一记录分隔符（U+2028/U+2029 是 JSON 字符串内容，
 * 不得断行；因此不能用按行读取的宿主 API，必须自行按 \n 切）。
 * 单行超过上限整行丢弃并上报（pai-cli 侧按 16 MiB 字节计，此处按字符数防御，量级等价）。
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
      return { frame: { type: 'event', threadId: reqString(obj.threadId), event: requireEventPayload(obj.event) } };
    case 'ui_request':
      return { frame: { type: 'ui_request', requestId: reqString(obj.requestId), threadId: reqString(obj.threadId), method: optString(obj.method), subagentId: optString(obj.subagentId), agent: optString(obj.agent), ...restFields(obj, ['type', 'requestId', 'threadId', 'method', 'subagentId', 'agent']) } };
    case 'heartbeat':
      return { frame: { type: 'heartbeat', subagents: optNumber(obj.subagents) } };
    case 'hub_error':
      return { frame: { type: 'hub_error', threadId: optString(obj.threadId), scope: reqString(obj.scope), error: reqString(obj.error) } };
    case 'thread_died':
      return { frame: { type: 'thread_died', threadId: reqString(obj.threadId), reason: reqString(obj.reason) } };
    case 'subagent_event':
      return { frame: { type: 'subagent_event', threadId: reqString(obj.threadId), subagentId: reqString(obj.subagentId), agent: reqString(obj.agent), task: reqString(obj.task), event: requireEventPayload(obj.event) } };
    case 'subagent_message':
      return { frame: { type: 'subagent_message', threadId: reqString(obj.threadId), subagentId: reqString(obj.subagentId), agent: reqString(obj.agent), text: reqString(obj.text), to: optString(obj.to) } };
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

/** 事件载荷防线：非对象/缺 type 的 event 视为垃圾帧（下游映射器据此免于崩溃）。 */
function requireEventPayload(value: unknown): { type: string } & Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as Record<string, unknown>)['type'] === 'string') {
    return value as { type: string } & Record<string, unknown>;
  }
  throw new Error('event_payload_invalid');
}

function optNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** ui_request 允许透传任意扩展字段（method 负载平铺在帧上）。 */
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
    // pai-cli 以 \n 收行；防御 Windows 编辑器写出的 \r 尾
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
        // 超限提前判定：堆积超上限立即进入丢弃态，不再继续拼接/扫描
        if (buffer.length - scanned > maxLineChars) {
          enterDiscarding();
          return;
        }
      }
      for (;;) {
        const index = buffer.indexOf('\n', scanned);
        if (index === -1) {
          scanned = buffer.length;
          break;
        }
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        scanned = 0;
        if (line.length > maxLineChars) {
          options.onDropped?.('line_too_long');
          continue;
        }
        handleLine(line);
      }
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
      if (tail.length > maxLineChars) {
        options.onDropped?.('line_too_long');
        return;
      }
      handleLine(tail);
    },
  };
}
