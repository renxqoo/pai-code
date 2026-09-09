import * as React from 'react';

import { isWindowStateEvent, type WindowState } from '@/lib/window-state';

/**
 * 壳层窗口状态镜像：挂载时经桥拉取初值，之后由主进程 window-state 事件驱动。
 * 浏览器直开（无 preload）时桥不存在，维持默认值降级。
 */
function useWindowState(): WindowState {
  const [state, setState] = React.useState<WindowState>({ maximized: false, fullscreen: false });
  React.useEffect(() => {
    const pai = window.pai;
    if (pai === undefined) return;
    let mounted = true;
    void pai.window.getState().then((initial) => {
      if (mounted) setState(initial);
    });
    const unsubscribe = pai.subscribe((event: unknown) => {
      if (isWindowStateEvent(event)) {
        setState({ maximized: event.maximized, fullscreen: event.fullscreen });
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  return state;
}

export { useWindowState };
