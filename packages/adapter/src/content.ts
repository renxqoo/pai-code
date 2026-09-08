/**
 * 消息内容块的收窄与扁平化：pi-ai 的宽松 content 形状 → 展示文本。
 * user 消息 content 有 string | 块数组双形态，渲染前必须统一。
 */

type Block = { type: string } & Record<string, unknown>;

export function isTextBlock(block: Block): boolean {
  return block.type === 'text';
}

export function isThinkingBlock(block: Block): boolean {
  return block.type === 'thinking';
}

export function isToolCallBlock(block: Block): boolean {
  return block.type === 'toolCall';
}

/** user 消息正文：string 直取；数组拼全部 text 块（图片块跳过）。 */
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

/** user 消息图片块：提取 data/mimeType（缺字段/空串的垃圾块丢弃）。 */
export function userImages(content: unknown): Array<{ type: 'image'; data: string; mimeType: string }> {
  if (!Array.isArray(content)) return [];
  const images: Array<{ type: 'image'; data: string; mimeType: string }> = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null || (block as Block).type !== 'image') continue;
    const data = (block as Block)['data'];
    const mimeType = (block as Block)['mimeType'];
    if (typeof data === 'string' && data.length > 0 && typeof mimeType === 'string' && mimeType.length > 0) {
      images.push({ type: 'image', data, mimeType });
    }
  }
  return images;
}

/** assistant 正文：拼全部 text 块（thinking 与 toolCall 不混入）。 */
export function assistantText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && isTextBlock(block as Block) && typeof (block as Block)['text'] === 'string') {
      parts.push((block as Block)['text'] as string);
    }
  }
  return parts.join('\n');
}

export function assistantThinking(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && isThinkingBlock(block as Block) && typeof (block as Block)['thinking'] === 'string') {
      parts.push((block as Block)['thinking'] as string);
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
    if (!isToolCallBlock(b)) continue;
    const id = typeof b['id'] === 'string' ? b['id'] : '';
    const name = typeof b['name'] === 'string' ? b['name'] : '';
    const args = typeof b['arguments'] === 'object' && b['arguments'] !== null ? (b['arguments'] as Record<string, unknown>) : {};
    calls.push({ id, name, args });
  }
  return calls;
}

/** 工具结果 content（TextContent|ImageContent 数组）→ 文本。 */
export function toolResultText(content: unknown): string {
  return flattenUserText(content);
}
