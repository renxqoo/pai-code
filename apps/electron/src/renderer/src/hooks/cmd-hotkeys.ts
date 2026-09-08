import * as React from 'react';

/** ⌘N/⌘K 命中判定：macOS ⌘、其余平台 Ctrl；Alt 组合不劫持（留给系统）。 */
export function resolveCmdHotkey(mod: { meta: boolean; ctrl: boolean; alt: boolean }, key: string): 'newThread' | 'search' | null {
  if (!(mod.meta || mod.ctrl) || mod.alt) return null;
  if (key === 'n' || key === 'N') return 'newThread';
  if (key === 'k' || key === 'K') return 'search';
  return null;
}

type CmdHotkeysHandlers = {
  /** ⌘N/Ctrl+N：新建任务。 */
  onNewThread: () => void;
  /** ⌘K/Ctrl+K：展开并聚焦侧栏搜索。 */
  onSearch: () => void;
};

/**
 * 窗口级 ⌘N/⌘K 快捷键（带修饰键组合在输入框聚焦时同样生效，平台惯例）。
 * enabled=false（任一模态覆盖/对话框开着）时不劫持：模态层优先于全局热键，
 * 否则 ⌘K 会把焦点从对话框抢进遮罩后方的搜索框。
 * 回调需引用稳定（本 hook 不做最新值中转）。
 */
export function useCmdHotkeys(handlers: CmdHotkeysHandlers, enabled: boolean): void {
  const { onNewThread, onSearch } = handlers;
  React.useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = resolveCmdHotkey({ meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey }, event.key);
      if (action === null) return;
      event.preventDefault();
      if (action === 'newThread') onNewThread();
      else onSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onNewThread, onSearch, enabled]);
}
