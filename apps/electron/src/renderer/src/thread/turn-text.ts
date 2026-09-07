import type { TurnModel } from './thread-model';

/** 轮次的正文内容（仅文本块）：时间戳行的复制入口用它承载整轮文字。 */
export function turnTextContent(turn: Pick<TurnModel, 'blocks'>): string {
  return turn.blocks
    .filter((block) => block.kind === 'text')
    .map((block) => (block.kind === 'text' ? block.text : ''))
    .join('\n\n');
}
