/**
 * 标题行内改名的小状态机（纯函数，组件只接线）：
 * null = 非编辑态；编辑态持草稿。提交裁决独立于状态迁移——空值/未变化不提交，
 * 由 titleCommit 收口（组件据此决定是否发起 setName）。
 */

export type TitleEditState = { draft: string } | null;

export type TitleEditEvent =
  | { kind: 'start'; title: string }
  | { kind: 'change'; value: string }
  | { kind: 'cancel' };

export function reduceTitleEdit(state: TitleEditState, event: TitleEditEvent): TitleEditState {
  if (event.kind === 'start') return { draft: event.title };
  if (state === null) return null;
  if (event.kind === 'change') return { draft: event.value };
  return null;
}

/** 提交裁决：null = 不提交（非编辑/空白/与原标题一致）；name = 应提交的会话名。 */
export function titleCommit(state: TitleEditState, original: string): { name: string } | null {
  if (state === null) return null;
  const name = state.draft.trim();
  if (name.length === 0 || name === original) return null;
  return { name };
}
