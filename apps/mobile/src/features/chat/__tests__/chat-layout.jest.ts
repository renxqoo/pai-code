import { describe, expect, it } from '@jest/globals';
import { chatLayout, conversationBottomPadding } from '@/features/chat/chat-layout';

describe('chat layout', () => {
  it('reserves room for the composer, focused input and expanded todo dock', () => {
    expect(conversationBottomPadding(false, false, false)).toBe(chatLayout.baseBottomPadding);
    expect(conversationBottomPadding(false, false, true)).toBe(chatLayout.baseBottomPadding + chatLayout.focusPadding);
    expect(conversationBottomPadding(true, false, false)).toBe(chatLayout.collapsedBottomPadding);
    expect(conversationBottomPadding(true, true, false)).toBe(chatLayout.expandedBottomPadding);
    expect(conversationBottomPadding(true, true, true)).toBe(chatLayout.expandedBottomPadding + chatLayout.focusPadding);
  });

  it('keeps the todo offset above the composer shell', () => {
    expect(chatLayout.todoOffset).toBeLessThan(chatLayout.baseBottomPadding);
  });
});
