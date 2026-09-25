import * as React from 'react';

/**
 * 运行计时（T34）：活跃时 1Hz 前进的当前时间（轮次耗时/子代理计时展示）。
 * tick 随订阅区域挂卸，不进 store——1Hz 重渲半径 = 所在区域（预算：全局 ≤3 份，各自门控：
 * 舞台随执行态、Agents 面板随工作中子代理、速览面板随运行中子代理）。
 */
export function useElapsedNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, [active]);
  return now;
}
