export const chatLayout = {
  baseBottomPadding: 96,
  collapsedBottomPadding: 152,
  expandedBottomPadding: 300,
  focusPadding: 64,
  todoOffset: 86,
} as const;

export function conversationBottomPadding(hasTodo: boolean, todoExpanded: boolean, composerFocused: boolean): number {
  const base = !hasTodo
    ? chatLayout.baseBottomPadding
    : todoExpanded
      ? chatLayout.expandedBottomPadding
      : chatLayout.collapsedBottomPadding;
  return base + (composerFocused ? chatLayout.focusPadding : 0);
}
