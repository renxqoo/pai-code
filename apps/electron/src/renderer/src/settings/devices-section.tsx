import * as React from 'react';

import { ActionButton, ToggleSwitch } from '@paiapp/ui';
import { RefreshCw, Smartphone } from 'lucide-react';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

/** 主进程 mobile-bridge 状态快照（pai:mobile-state 应答形状）。 */
export interface MobileBridgeState {
  enabled: boolean;
  pairCode: { code: string; expiresAt: number } | null;
  lockedUntil: number;
  devices: string[];
  pairedCount: number;
}

type DevicesSectionProps = {
  state: MobileBridgeState | null;
  loading: boolean;
  onRefresh: () => void;
  onToggle: (enabled: boolean) => void;
  onGenerateCode: () => void;
  onRevoke: (deviceName: string) => void;
};

/** 剩余有效期（分钟，向上取整）；无码/锁定返回 null。 */
function minutesLeft(expiresAt: number, now: number): number | null {
  const ms = expiresAt - now;
  if (ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * 设备与连接分区（T57 桌面设备页）：连接开关、配对码卡（生成/刷新/倒计时/锁定态）、
 * 已连接设备列表（实时）、已配对设备（撤销入口）。数据源 pai:mobile-state 轮询 + 操作后刷新。
 */
function DevicesSection({ state, loading, onRefresh, onToggle, onGenerateCode, onRevoke }: DevicesSectionProps) {
  const [now, setNow] = React.useState(() => Date.now());

  // 配对码在屏时倒计时（1s tick；无码/停用不挂表）
  React.useEffect(() => {
    if (state?.pairCode == null) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (state.pairCode?.expiresAt !== undefined && state.pairCode.expiresAt <= Date.now()) onRefresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [state, onRefresh]);

  const locked = (state?.lockedUntil ?? 0) > now;

  return (
    <section>
      <SettingsPageHeader title={copy.settings.devicesTitle} description={copy.settings.devicesDesc} />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="divide-y divide-border">
          <SettingsRow title={copy.settings.devicesBridgeLabel} description={copy.settings.devicesBridgeHint}>
            <ToggleSwitch
              checked={state?.enabled ?? false}
              onCheckedChange={onToggle}
              aria-label={copy.settings.devicesBridgeLabel}
              disabled={loading}
            />
          </SettingsRow>
        </SettingsCard>

        {state !== null && !state.enabled ? (
          <SettingsCard className="px-[20px] py-[16px]">
            <p className="text-[13px] text-muted-foreground">{copy.settings.devicesOff}</p>
          </SettingsCard>
        ) : (
          <>
            <SettingsCard className="px-[20px] py-[16px]">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{copy.settings.devicesPairTitle}</p>
                  <p className="mt-[2px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.devicesPairHint}</p>
                </div>
                {state?.pairCode != null ? (
                  <ActionButton size="sm" variant="outline" onClick={onGenerateCode}>
                    <RefreshCw className="h-[13px] w-[13px]" aria-hidden />
                    {copy.settings.devicesPairRefresh}
                  </ActionButton>
                ) : (
                  <ActionButton size="sm" onClick={onGenerateCode} disabled={locked || loading}>
                    {copy.settings.devicesPairGenerate}
                  </ActionButton>
                )}
              </div>
              {locked ? (
                <p className="mt-[14px] text-[13px] text-destructive">{copy.settings.devicesPairLocked}</p>
              ) : state?.pairCode != null ? (
                <div className="mt-[14px] flex items-center gap-[14px]">
                  <p className="font-mono text-[30px] font-semibold tracking-[0.28em] text-foreground select-all">{state.pairCode.code.slice(0, 3)} {state.pairCode.code.slice(3)}</p>
                  {(() => {
                    const left = minutesLeft(state.pairCode.expiresAt, now);
                    return left === null ? null : (
                      <span className="text-[12px] text-muted-foreground">{copy.settings.devicesPairExpiresIn.replace('{minutes}', String(left))}</span>
                    );
                  })()}
                </div>
              ) : (
                <p className="mt-[14px] text-[12px] text-muted-foreground">{copy.settings.devicesAddressHint}</p>
              )}
            </SettingsCard>

            <SettingsCard className="px-[20px] py-[16px]">
              <p className="text-[13px] font-medium text-foreground">{copy.settings.devicesConnectedTitle}</p>
              <p className="mt-[2px] text-[12px] text-muted-foreground">{copy.settings.devicesConnectedHint}</p>
              <div className="mt-[10px] flex flex-col gap-[6px]">
                {state !== null && state.devices.length > 0 ? (
                  state.devices.map((device) => (
                    <div key={device} className="flex items-center gap-[10px] rounded-lg border border-border px-[12px] py-[8px]">
                      <Smartphone className="h-[15px] w-[15px] text-muted-foreground" aria-hidden />
                      <span className="text-[13px] text-foreground">{device}</span>
                      <span className="ml-auto inline-flex items-center gap-[6px]">
                        <span className="inline-block h-[6px] w-[6px] rounded-full bg-emerald-500" aria-hidden />
                        <span className="text-[12px] text-muted-foreground">已连接</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-muted-foreground">{copy.settings.devicesEmpty}</p>
                )}
              </div>
            </SettingsCard>

            <SettingsCard className="px-[20px] py-[16px]">
              <p className="text-[13px] font-medium text-foreground">{copy.settings.devicesPairedTitle}</p>
              <p className="mt-[2px] text-[12px] text-muted-foreground">{copy.settings.devicesPairedHint}</p>
              <div className="mt-[10px] flex flex-col gap-[6px]">
                {state !== null && state.devices.length > 0 ? (
                  state.devices.map((device) => (
                    <div key={`paired-${device}`} className="flex items-center gap-[10px] rounded-lg border border-border px-[12px] py-[8px]">
                      <Smartphone className="h-[15px] w-[15px] text-muted-foreground" aria-hidden />
                      <span className="text-[13px] text-foreground">{device}</span>
                      <ActionButton size="sm" variant="outline" className="ml-auto" onClick={() => onRevoke(device)} disabled={loading}>
                        {copy.settings.devicesRevoke}
                      </ActionButton>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-muted-foreground">{copy.settings.devicesPairedEmpty}</p>
                )}
              </div>
            </SettingsCard>
          </>
        )}
      </div>
    </section>
  );
}

export { DevicesSection };
