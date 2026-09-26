import * as React from 'react';

// 仅 active 时按 1Hz 刷新时间戳快照；非 active 或卸载后保持冻结，不持有定时器。
export function useElapsedNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
