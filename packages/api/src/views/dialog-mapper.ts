import type { UiEvent, UiRequestFrame } from '@paiapp/contracts';

/**
 * ui_request 帧 → dialogRequest 事件。
 * host-hub 仅实现 confirm：载荷 {tool, summary, reason} 平铺在帧上；
 * 应答走 dialog/respond（payload {confirmed: boolean}）。
 */
export function mapDialogRequest(frame: UiRequestFrame): UiEvent {
  return {
    type: 'dialogRequest',
    threadId: frame.threadId,
    requestId: frame.requestId,
    method: typeof frame.method === 'string' ? frame.method : 'confirm',
    tool: strField(frame.tool),
    summary: strField(frame.summary),
    reason: strField(frame.reason),
    ...(frame.agentName !== undefined ? { agentName: frame.agentName } : {}),
  };
}

function strField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
