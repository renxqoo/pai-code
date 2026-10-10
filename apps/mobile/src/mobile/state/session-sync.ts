/**
 * UiEvent → ChatMessage 归并器（T57 §5 核心）：hub 事件流折叠为移动端
 * TimelineList 消费的 ChatMessage[]（与 PC live-controller 同语义）。
 *
 * 事件字段形状以 @x3code/contracts/ui-events 为单一真相：
 * - turnStarted → streaming=true；turnSettled{ok,reason} → streaming=false（失败落 status 行）
 * - userMessage{message:{seq,text,origin,images}} → 用户行（origin=system 不进列表——过程噪音；
 *   id = `u-<seq>` 与历史水化同域，seed 后同条不重复上屏）
 * - textDelta/thinkingDelta{messageId,delta} → 流式累积（thinking 行 status=running）
 * - messageFinal{message:{id,text,thinking,toolCalls}} → 权威终局（整体替换流式缓冲；
 *   message.toolCalls 展开工具行——toolCallAdded 事件期间已建的行按 callId 复用位置）
 * - toolCallAdded{callId? 无——call.id,call.name,call.argsPreview,diff,subagents} → 工具行
 * - toolUpdated{callId,output} / toolEnded{callId,output,isError,durationMs,diff,subagents}
 * - streamRestarted{messageId} → 该消息流式缓冲清空重来
 * - dialogRequest{requestId,method,tool,summary,reason} → 权限卡片（回调外置）
 * - dialogSettled{requestId} → 清权限卡片
 * - 其余（sessionUpdated/sessionRemoved/host/…）→ onSessionEvent 外置（history-sync 消费）
 */
import { copy } from '@/strings/zh';
import type { ChatMessage } from '@/types/domain';
import { toolRowId } from '../relay/tool-rows';

export interface SessionSyncState {
  messages: ChatMessage[];
  streaming: boolean;
}

export interface SessionSyncCallbacks {
  /** 权限弹窗（dialogRequest → 显示；dialogSettled → 按 requestId 清除对应卡）。 */
  onDialogRequest(request: { requestId: string; title: string; command: string } | null, settledId?: string | null): void;
  /** 会话级事件外置（sessionUpdated/sessionRemoved/host/queueChanged…）。 */
  onSessionEvent(event: Record<string, unknown>): void;
}

/** 事件字段安全取串：非 string/number → '' */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function createSessionSync(callbacks: SessionSyncCallbacks) {
  let messages: ChatMessage[] = [];
  let streaming = false;
  /** 流式 messageId → {assistant 索引, thinking 索引} */
  const liveIndex = new Map<string, { assistant: number; thinking: number }>();
  /** callId → 工具行索引（messageFinal 展开时复用） */
  const toolIndex = new Map<string, number>();
  /** (turn,step) → 重试行（连续重试原地换序号；模型重新产出即摘除——transient，与 PC 端同生命周期）。
   *  值带行 id：摘除按 id 标记（视图出口过滤），不按下标——下标会随其它行增删位移。 */
  const retryIndex = new Map<string, { index: number; id: string }>();
  /** 已摘除的重试行 id（视图出口过滤，索引域不动） */
  const droppedRetryIds = new Set<string>();

  const append = (message: ChatMessage): number => {
    messages = [...messages, message];
    return messages.length - 1;
  };

  const patch = (index: number, patchFn: (previous: ChatMessage) => ChatMessage): void => {
    if (index < 0 || index >= messages.length) return;
    const next = [...messages];
    next[index] = patchFn(next[index] as ChatMessage);
    messages = next;
  };

  /**
 * 摘除重试行（模型重新产出 / 轮结算）：标记而非就地删除——liveIndex/toolIndex 存的是
 * 数组下标，就地 splice 会让其后所有行的下标位移、索引表整体错指他行。视图在 snapshot
 * 出口过滤，索引域保持稳定。
 */
  const dropRetry = (): void => {
    for (const entry of retryIndex.values()) droppedRetryIds.add(entry.id);
    retryIndex.clear();
  };

  /**
   * 工具行下标解析：运行期建的行走 callId 索引；水化出来的历史行走 id 域
   * （`tool-<callId>`，与 WAL 投影同一拼法）——否则重放/补投的 toolEnded
   * 找不到水化行，运行态永远收敛不掉。
   */
  const toolRowOf = (callId: string): number | undefined => {
    const indexed = toolIndex.get(callId);
    if (indexed !== undefined) return indexed;
    if (callId.length === 0) return undefined;
    const rowId = toolRowId(callId);
    for (let position = 0; position < messages.length; position += 1) {
      if (messages[position]?.id === rowId) return position;
    }
    return undefined;
  };

  const ofLive = (messageId: string): { assistant: number; thinking: number } => {
    let entry = liveIndex.get(messageId);
    if (entry === undefined) {
      entry = { assistant: -1, thinking: -1 };
      liveIndex.set(messageId, entry);
    }
    return entry;
  };

  const handleEvent = (event: Record<string, unknown>): void => {
    const type = event['type'];

    if (type === 'turnStarted') {
      streaming = true;
      dropRetry();
      return;
    }
    if (type === 'turnSettled') {
      streaming = false;
      dropRetry();
      const ok = event['ok'] === true;
      // 残余 running 态收敛（流中断的 thinking/工具行）
      messages = messages.map((message) => (message.status === 'running' ? { ...message, status: ok ? 'ok' : 'stopped' } : message));
      if (!ok) {
        const reason = typeof event['reason'] === 'string' ? event['reason'] : '任务失败';
        append({ id: `settle-fail-${messages.length}`, kind: 'status', text: reason, createdAt: new Date().toISOString(), status: 'failed', summary: '任务未完成' });
      }
      return;
    }
    if (type === 'userMessage') {
      const message = event['message'] as { seq?: number; text?: string; origin?: string } | undefined;
      if (message?.origin !== 'user') return; // 系统注入不进列表
      // 身份与历史水化同域（`u-<seq>`，response-map.walToMessages 同一拼法）：
      // 历史先到（seed）时同条事件不再重插（否则同句话两条气泡——与 PC 端同症状）。
      const seq = message.seq;
      const id = typeof seq === 'number' && Number.isFinite(seq) ? `u-${seq}` : `user-${messages.length}`;
      if (messages.some((existing) => existing.id === id)) return;
      append({ id, kind: 'user', text: message.text ?? '', createdAt: new Date().toISOString() });
      return;
    }
    if (type === 'streamRestarted') {
      const messageId = textOf(event['messageId']);
      const entry = liveIndex.get(messageId);
      if (entry !== undefined) {
        if (entry.assistant >= 0) patch(entry.assistant, (previous) => ({ ...previous, text: '' }));
        if (entry.thinking >= 0) patch(entry.thinking, (previous) => ({ ...previous, text: '' }));
      }
      return;
    }
    if (type === 'retrying') {
      const turn = typeof event['turn'] === 'number' ? event['turn'] : -1;
      const step = typeof event['step'] === 'number' ? event['step'] : -1;
      const attempt = typeof event['attempt'] === 'number' ? event['attempt'] : 0;
      const code = typeof event['code'] === 'string' ? event['code'] : null;
      const key = `${turn}-${step}`;
      const line = copy.retryLine(attempt, code);
      const raw = textOf(event['message']);
      const existing = retryIndex.get(key);
      if (existing !== undefined && existing.index >= 0 && existing.index < messages.length) {
        // 同一 attempt 连续重试：原地换序号与文案（不叠行）
        patch(existing.index, (previous) => ({ ...previous, text: line, summary: raw }));
        return;
      }
      const id = `retry-${key}-${attempt}`;
      retryIndex.set(key, { index: append({ id, kind: 'status', text: line, createdAt: new Date().toISOString(), status: 'running', summary: raw }), id });
      return;
    }
    if (type === 'textDelta' || type === 'thinkingDelta') {
      // 模型重新产出 = 重试已恢复（与 PC 端 MODEL_PRODUCED 清除面同一条规则）
      dropRetry();
      const messageId = textOf(event['messageId']);
      const delta = textOf(event['delta']);
      if (messageId.length === 0 || delta.length === 0) return;
      const entry = ofLive(messageId);
      const slot = type === 'textDelta' ? 'assistant' : 'thinking';
      if (entry[slot] < 0) {
        const index = append({
          id: `live-${messageId}-${slot}`,
          kind: slot === 'assistant' ? 'assistant' : 'thinking',
          text: delta,
          createdAt: new Date().toISOString(),
          ...(slot === 'thinking' ? { status: 'running' } : {}),
        });
        entry[slot] = index;
        return;
      }
      patch(entry[slot] as number, (previous) => ({ ...previous, text: previous.text + delta }));
      return;
    }
    if (type === 'messageFinal') {
      dropRetry();
      const message = event['message'] as { id?: string; text?: string; thinking?: string; toolCalls?: Array<{ id: string; name: string; argsPreview: string; output?: string; isError?: boolean }> } | undefined;
      if (message === undefined) return;
      const messageId = message.id ?? '';
      const entry = liveIndex.get(messageId);
      // 权威终局：流式 assistant 缓冲整体替换；无缓冲（纯工具消息）则新增
      if (entry !== undefined && entry.assistant >= 0) {
        patch(entry.assistant, (previous) => ({ ...previous, text: message.text ?? previous.text }));
      } else if ((message.text ?? '').length > 0) {
        append({ id: `final-${messageId}`, kind: 'assistant', text: message.text ?? '', createdAt: new Date().toISOString() });
      }
      if (entry !== undefined && entry.thinking >= 0) {
        const thinking = message.thinking ?? '';
        patch(entry.thinking, (previous) => ({ ...previous, text: thinking.length > 0 ? thinking : previous.text, status: 'ok' }));
      }
      liveIndex.delete(messageId);
      return;
    }
    if (type === 'toolCallAdded') {
      dropRetry();
      const call = event['call'] as { id?: string; name?: string; argsPreview?: string; subagents?: unknown[]; editHunks?: unknown[] } | undefined;
      const callId = call?.id ?? '';
      if (callId.length === 0) return;
      const toolMessage: ChatMessage = {
        id: `tool-${callId}`,
        kind: 'tool',
        text: '',
        createdAt: new Date().toISOString(),
        status: 'running',
        toolName: call?.name ?? 'tool',
        argsPreview: call?.argsPreview ?? '',
      };
      if (Array.isArray(call?.editHunks)) toolMessage.editHunks = call.editHunks as NonNullable<ChatMessage['editHunks']>;
      if (Array.isArray(call?.subagents)) toolMessage.subagents = call.subagents as NonNullable<ChatMessage['subagents']>;
      const index = append(toolMessage);
      toolIndex.set(callId, index);
      return;
    }
    if (type === 'toolUpdated') {
      const index = toolRowOf(textOf(event['callId']));
      if (index !== undefined) patch(index, (previous) => ({ ...previous, text: typeof event['output'] === 'string' ? event['output'] : previous.text }));
      return;
    }
    if (type === 'toolEnded') {
      const callId = textOf(event['callId']);
      const index = toolRowOf(callId);
      if (index === undefined) return;
      const isError = event['isError'] === true;
      const durationMs = typeof event['durationMs'] === 'number' ? event['durationMs'] : undefined;
      patch(index, (previous) => ({
        ...previous,
        status: isError ? 'failed' : 'ok',
        text: typeof event['output'] === 'string' ? event['output'] : previous.text,
        ...(durationMs !== undefined ? { durationMs } : {}),
      }));
      toolIndex.delete(callId);
      return;
    }
    if (type === 'dialogRequest') {
      const requestId = textOf(event['requestId']);
      if (requestId.length === 0) return;
      const tool = typeof event['tool'] === 'string' ? (event['tool'] as string) : '';
      const summary = typeof event['summary'] === 'string' ? (event['summary'] as string) : '';
      const reason = typeof event['reason'] === 'string' ? (event['reason'] as string) : '';
      callbacks.onDialogRequest({ requestId, title: summary.length > 0 ? summary : '确认操作', command: [tool, reason].filter((part) => part.length > 0).join('\n') });
      return;
    }
    if (type === 'dialogSettled') {
      callbacks.onDialogRequest(null, textOf(event['requestId']) || null);
      return;
    }
    // 会话级/其余事件外置
    callbacks.onSessionEvent(event);
  };

  return {
    handleEvent,
    reset(): void {
      messages = [];
      streaming = false;
      liveIndex.clear();
      toolIndex.clear();
      retryIndex.clear();
      droppedRetryIds.clear();
    },
    /** 历史水化（session/entries 映射产物整体替换）。 */
    seed(items: ChatMessage[]): void {
      messages = items;
      streaming = false;
      liveIndex.clear();
      toolIndex.clear();
      retryIndex.clear();
      droppedRetryIds.clear();
    },
    snapshot(): SessionSyncState {
      return { messages: droppedRetryIds.size === 0 ? messages : messages.filter((message) => !droppedRetryIds.has(message.id)), streaming };
    },
  };
}
