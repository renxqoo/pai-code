/**
 * 消息内容块的收窄与扁平化：内核 ContentBlock 形状 → 展示文本。
 * 内核词法：text / thinking（文本在 text 键）/ tool_use（参数在 input 键）/
 * tool_result（嵌套 content）/ image（mediaType 键）。
 */

type Block = { type: string } & Record<string, unknown>;

export function isTextBlock(block: Block): boolean {
  return block.type === 'text';
}

export function isThinkingBlock(block: Block): boolean {
  return block.type === 'thinking';
}

export function isToolUseBlock(block: Block): boolean {
  return block.type === 'tool_use';
}

/** user 消息正文：拼全部 text 块（图片块跳过）。 */
export function flattenUserText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && isTextBlock(block as Block) && typeof (block as Block)['text'] === 'string') {
      parts.push((block as Block)['text'] as string);
    }
  }
  return parts.join('\n');
}

/** user 消息图片块：提取 data/mediaType（缺字段/空串的垃圾块丢弃）。 */
export function userImages(content: unknown): Array<{ type: 'image'; data: string; mediaType: string }> {
  if (!Array.isArray(content)) return [];
  const images: Array<{ type: 'image'; data: string; mediaType: string }> = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null || (block as Block).type !== 'image') continue;
    const data = (block as Block)['data'];
    const mediaType = (block as Block)['mediaType'];
    if (typeof data === 'string' && data.length > 0 && typeof mediaType === 'string' && mediaType.length > 0) {
      images.push({ type: 'image', data, mediaType });
    }
  }
  return images;
}

/** assistant 正文：拼全部 text 块（thinking 与 tool_use 不混入）。 */
export function assistantText(content: unknown): string {
  return flattenUserText(content);
}

export function assistantThinking(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && isThinkingBlock(block as Block) && typeof (block as Block)['text'] === 'string') {
      parts.push((block as Block)['text'] as string);
    }
  }
  return parts.join('\n');
}

export interface ToolCallBlockView {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export function assistantToolCalls(content: unknown): ToolCallBlockView[] {
  if (!Array.isArray(content)) return [];
  const calls: ToolCallBlockView[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Block;
    if (!isToolUseBlock(b)) continue;
    const id = typeof b['callId'] === 'string' ? b['callId'] : '';
    const name = typeof b['name'] === 'string' ? b['name'] : '';
    calls.push({ id, name, args: argsOfInput(b['input']) });
  }
  return calls;
}

/** tool_use.input = JSON 字符串（宽容解析：坏 JSON/非串降级空对象）。 */
function argsOfInput(input: unknown): Record<string, unknown> {
  if (typeof input !== 'string' || input.length === 0) {
    return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  }
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 工具结果 content（纯文本 string）→ 文本。 */
export function toolResultText(content: unknown): string {
  return typeof content === 'string' ? content : flattenUserText(content);
}
