import * as React from 'react';

import type { MobileBridgeState } from './devices-section';

export interface DevicesSectionPropsLike {
  state: MobileBridgeState | null;
  loading: boolean;
  onRefresh: () => void;
  onToggle: (enabled: boolean) => void;
  onGenerateCode: () => void;
  onRevoke: (deviceName: string) => void;
}

/** preload 桥的移动端面（window.pai.mobile；浏览器直开时 undefined）。 */
interface MobileBridgeFace {
  state(): Promise<unknown>;
  setEnabled(enabled: boolean): Promise<unknown>;
  generatePairCode(): Promise<unknown>;
  revoke(deviceName: string): Promise<unknown>;
}

const isMobileState = (value: unknown): value is MobileBridgeState => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['enabled'] === 'boolean' &&
    Array.isArray(record['devices']) &&
    typeof record['lockedUntil'] === 'number' &&
    typeof record['pairedCount'] === 'number' &&
    (record['pairCode'] === null || (typeof record['pairCode'] === 'object' && record['pairCode'] !== null))
  );
};

/**
 * 设备与连接分区面板（T57）：分区激活期间 5s 轮询 pai:mobile-state + 操作后即时刷新。
 * 生成配对码走专用 IPC（pai:mobile-pair-code——ApiSchemas 之外的主进程控制面）。
 */
export function useMobileBridgePanel(active: boolean, inject?: MobileBridgeFace): DevicesSectionPropsLike {
  const [state, setState] = React.useState<MobileBridgeState | null>(null);
  const [loading, setLoading] = React.useState(false);

  const mobile: MobileBridgeFace | undefined = inject ?? (typeof window !== 'undefined' ? (window.pai?.mobile as MobileBridgeFace | undefined) : undefined);

  const refresh = React.useCallback(() => {
    if (mobile === undefined) return;
    setLoading(true);
    void mobile
      .state()
      .then((raw) => {
        if (isMobileState(raw)) setState(raw);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [mobile]);

  // 分区激活：立即拉一次 + 5s 轮询（设备连接/断开即时反映）；离开停表
  React.useEffect(() => {
    if (!active) return;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const onToggle = React.useCallback(
    (enabled: boolean) => {
      if (mobile === undefined) return;
      setLoading(true);
      void mobile
        .setEnabled(enabled)
        .then(() => mobile.state())
        .then((raw) => {
          if (isMobileState(raw)) setState(raw);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    },
    [mobile],
  );

  const onGenerateCode = React.useCallback(() => {
    if (mobile === undefined) return;
    setLoading(true);
    void mobile
      .generatePairCode()
      .then(() => refresh())
      .finally(() => setLoading(false));
  }, [mobile, refresh]);

  const onRevoke = React.useCallback(
    (deviceName: string) => {
      if (mobile === undefined) return;
      setLoading(true);
      void mobile
        .revoke(deviceName)
        .then(() => mobile.state())
        .then((raw) => {
          if (isMobileState(raw)) setState(raw);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    },
    [mobile],
  );

  return { state, loading, onRefresh: refresh, onToggle, onGenerateCode, onRevoke };
}
