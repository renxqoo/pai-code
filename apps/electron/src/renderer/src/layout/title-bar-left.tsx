import * as React from 'react';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { useObservedWidth } from '@/hooks/use-observed-width';
import { useWindowState } from '@/hooks/use-window-state';
import { TITLEBAR_LEFT_PADDING, TITLEBAR_LEFT_PADDING_FULLSCREEN } from '@/lib/platform';

type TitleBarLeftProps = {
  titleName: string
  titleSuffix: string
  toggleLabel: string
  collapsed: boolean
  sidebarWidth: number
  onToggle: () => void
}

/**
 * 标题覆盖块：fixed 在窗口左上（macOS 落在红绿灯右侧），不占布局行高——
 * 主区头部与它同排共享顶行。侧栏展开时宽度被钳制在侧栏内（不伸入主区），
 * 收起时保持内容宽并发布 --titlebar-left-w 供主区头部避让。
 * 全屏态（macOS 红绿灯隐藏）左距收窄，侧栏开关贴近窗口左缘。
 */
function TitleBarLeft({ titleName, titleSuffix, toggleLabel, collapsed, sidebarWidth, onToggle }: TitleBarLeftProps) {
  const { fullscreen } = useWindowState();
  const publishWidth = React.useCallback((width: number) => {
    document.documentElement.style.setProperty('--titlebar-left-w', `${Math.round(width)}px`);
  }, []);
  const rootRef = useObservedWidth<HTMLDivElement>(publishWidth);

  return (
    <div
      ref={rootRef}
      className="app-drag pointer-events-none fixed top-0 left-0 z-30 flex h-[46px] items-center gap-[14px] pr-4 transition-[padding] duration-200 motion-reduce:transition-none"
      style={{
        paddingLeft: fullscreen ? TITLEBAR_LEFT_PADDING_FULLSCREEN : TITLEBAR_LEFT_PADDING,
        maxWidth: collapsed ? undefined : sidebarWidth,
      }}
    >
      <IconButton
        label={toggleLabel}
        size="sm"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="app-no-drag pointer-events-auto -ml-1 text-muted-foreground/90"
      >
        {collapsed ? <PanelLeftOpen strokeWidth={1.75} /> : <PanelLeftClose strokeWidth={1.75} />}
      </IconButton>
      <span className="min-w-0 truncate text-[13.5px] leading-none tracking-[-0.01em]">
        <span className="font-bold text-foreground">{titleName}</span>
        <span className="font-medium text-foreground/70"> {titleSuffix}</span>
      </span>
    </div>
  );
}

export { TitleBarLeft };
