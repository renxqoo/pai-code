import * as React from 'react';

// 仅 active 时按 1Hz 刷新时间戳快照；非 active 或卸载后保持冻结，不持有定时器。
export function useElapsedNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return undefined;
    // 激活瞬间的刷新挪到宏任务（避免 effect 内同步 setState 级联渲染），其余交给 1Hz 快照
    const kickoff = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}
