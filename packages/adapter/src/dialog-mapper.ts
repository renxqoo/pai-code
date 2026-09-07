import type { UiEvent, UiRequestFrame } from '@paiapp/contracts';

/**
 * ui_request 帧 → dialogRequest 事件。
 * notify / setStatus 无需应答（fire-and-forget），仍以 dialogRequest 事件呈现
 * （渲染层按提示条样式处理，不进应答流程）。
 */
export function mapDialogRequest(frame: UiRequestFrame): UiEvent {
  const method = typeof frame.method === 'string' ? frame.method : '';
  return {
    type: 'dialogRequest',
    threadId: frame.threadId,
    requestId: frame.requestId,
    method,
    title: strField(frame.title),
    message: strField(frame.message),
    options: strListField(frame.options),
    placeholder: strField(frame.placeholder),
    prefill: strField(frame.prefill),
    subagentId: strField(frame.subagentId),
    agent: strField(frame.agent),
  };
}

function strField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** select 的 options 形态宽松（string 或 {label,value}），统一窄化为 label 列表。 */
function strListField(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const labels: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      labels.push(item);
    } else if (typeof item === 'object' && item !== null) {
      const label = (item as Record<string, unknown>)['label'] ?? (item as Record<string, unknown>)['value'];
      if (typeof label === 'string') labels.push(label);
    }
  }
  return labels;
}
