import * as React from 'react';

export type CmdHotkeyAction = 'newThread' | 'search' | 'toggleDiff' | 'toggleAgents' | 'palette';

/** ⌘N/⌘K/⌘P/⌘⇧D/⌘⇧A 命中判定：macOS ⌘、其余平台 Ctrl；Alt 组合不劫持（留给系统）。 */
export function resolveCmdHotkey(mod: { meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }, key: string): CmdHotkeyAction | null {
  if (!(mod.meta || mod.ctrl) || mod.alt) return null;
  const lower = key.toLowerCase();
  // shift 组合单独分派（面板开关）；⌘D/⌘A 裸组合不劫持（编辑器/系统语义）
  if (mod.shift) {
    if (lower === 'd') return 'toggleDiff';
    if (lower === 'a') return 'toggleAgents';
    return null;
  }
  if (lower === 'n') return 'newThread';
  if (lower === 'k') return 'search';
  if (lower === 'p') return 'palette';
  return null;
}

type CmdHotkeysHandlers = {
  /** ⌘N/Ctrl+N：新建任务。 */
  onNewThread: () => void;
  /** ⌘K/Ctrl+K：展开并聚焦侧栏搜索。 */
  onSearch: () => void;
  /** ⌘⇧D/Ctrl+Shift+D：切换 Diff 面板。 */
  onToggleDiff: () => void;
  /** ⌘⇧A/Ctrl+Shift+A：切换子代理面板。 */
  onToggleAgents: () => void;
  /** ⌘P/Ctrl+P：切换命令面板（paletteEnabled 独立于 enabled——面板开着也要能再按关掉）。 */
  onPalette: () => void;
};

/**
 * 窗口级 ⌘N/⌘K/⌘⇧D/⌘⇧A/⌘P 快捷键（带修饰键组合在输入框聚焦时同样生效，平台惯例）。
 * enabled=false（任一模态覆盖/对话框开着）时非面板热键不劫持：模态层优先于
 * 全局热键，否则 ⌘K 会把焦点从对话框抢进遮罩后方的搜索框。paletteEnabled
 * 独立门控 ⌘P（hub 对话框开着时不唤面板；面板自身开着时仍可再按关闭）。
 * 回调需引用稳定（本 hook 不做最新值中转）。
 */
export function useCmdHotkeys(handlers: CmdHotkeysHandlers, enabled: boolean, paletteEnabled: boolean): void {
  const { onNewThread, onSearch, onToggleDiff, onToggleAgents, onPalette } = handlers;
  React.useEffect(() => {
    if (!enabled && !paletteEnabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = resolveCmdHotkey({ meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey }, event.key);
      if (action === null) return;
      if (action === 'palette') {
        if (!paletteEnabled) return;
        event.preventDefault();
        onPalette();
        return;
      }
      if (!enabled) return;
      event.preventDefault();
      if (action === 'newThread') onNewThread();
      else if (action === 'search') onSearch();
      else if (action === 'toggleDiff') onToggleDiff();
      else if (action === 'toggleAgents') onToggleAgents();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onNewThread, onSearch, onToggleDiff, onToggleAgents, onPalette, enabled, paletteEnabled]);
}
