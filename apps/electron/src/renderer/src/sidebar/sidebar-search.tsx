import * as React from 'react';
import { useStore } from 'zustand';

import { SidebarSearchInput } from '@/sidebar/sidebar-search-input';
import { uiStore } from '@/ui/ui-store';

/** 侧栏内联搜索组装：开合/查询/聚焦信号自订阅（ui store），输入框本体保持纯展示。 */
function SidebarSearch(): React.JSX.Element | null {
  const open = useStore(uiStore, (s) => s.sidebarSearchOpen);
  const query = useStore(uiStore, (s) => s.sidebarQuery);
  const focusToken = useStore(uiStore, (s) => s.searchFocusToken);
  if (!open) return null;
  return (
    <div className="pt-1.5">
      <SidebarSearchInput
        query={query}
        focusToken={focusToken}
        onQueryChange={(value) => uiStore.getState().setSidebarQuery(value)}
        onClose={() => uiStore.getState().closeSidebarSearch()}
      />
    </div>
  );
}

const SidebarSearchMemo = React.memo(SidebarSearch);
export { SidebarSearchMemo as SidebarSearch };
