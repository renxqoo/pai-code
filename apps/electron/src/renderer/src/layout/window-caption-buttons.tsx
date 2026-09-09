import { Copy, Minus, Square, X } from 'lucide-react';

import { useWindowState } from '@/hooks/use-window-state';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

/**
 * Windows 自绘 caption 三键（hidden 标题栏下系统按钮不可用）：
 * 经 preload 桥驱动窗口动作，最大化状态由主进程推送、图标随之切换。
 */
function WindowCaptionButtons() {
  const { maximized } = useWindowState();

  const buttons = [
    {
      key: 'minimize',
      label: copy.flow.captionMinimize,
      icon: <Minus strokeWidth={2} className="size-[12px]" />,
      onClick: () => void window.pai?.window.minimize(),
      danger: false,
    },
    {
      key: 'maximize',
      label: maximized ? copy.flow.captionRestore : copy.flow.captionMaximize,
      icon: maximized ? (
        <Copy strokeWidth={2} className="size-[11px]" />
      ) : (
        <Square strokeWidth={2} className="size-[10px]" />
      ),
      onClick: () => void window.pai?.window.toggleMaximize(),
      danger: false,
    },
    {
      key: 'close',
      label: copy.flow.captionClose,
      icon: <X strokeWidth={2} className="size-[13px]" />,
      onClick: () => void window.pai?.window.close(),
      danger: true,
    },
  ];

  return (
    <div className="fixed top-0 right-0 z-30 flex h-[46px]">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          aria-label={button.label}
          title={button.label}
          onClick={button.onClick}
          className={cn(
            'flex h-full w-[46px] cursor-pointer items-center justify-center outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
            button.danger
              ? 'text-muted-foreground hover:bg-destructive hover:text-white'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
}

export { WindowCaptionButtons };
