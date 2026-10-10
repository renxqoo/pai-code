import { create } from 'zustand';

/**
 * 项目组折叠态（对话历史抽屉）：折叠与展开是两件事，分开存——
 * 折叠收起整组会话，展开只把组内前 N 条放成全量。
 */
type GroupFoldState = {
  collapsed: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  toggleCollapsed: (key: string) => void;
  toggleExpanded: (key: string) => void;
};

const flip = (source: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  const next = new Set(source);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export const useGroupFoldStore = create<GroupFoldState>((set) => ({
  collapsed: new Set<string>(),
  expanded: new Set<string>(),
  toggleCollapsed: (key) => set((state) => ({ collapsed: flip(state.collapsed, key) })),
  toggleExpanded: (key) => set((state) => ({ expanded: flip(state.expanded, key) })),
}));