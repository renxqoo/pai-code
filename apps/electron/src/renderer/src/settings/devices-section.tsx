import * as React from 'react';

import { ActionButton } from '@paiapp/ui';
import { KeyRound, QrCode, RefreshCw, ShieldOff, Smartphone } from 'lucide-react';

import { copy } from '@/strings';
import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

/** gateway owner 命令应答形状（gateway-command IPC）。 */
type GatewayResult = { ok: false; reason: string } | { ok: true; body: Record<string, unknown> };

/** gw/status 数据。 */
interface GatewayStatus {
  installationId: string;
  remoteEnabled: boolean;
  devices: number;
  threads: number;
  hostAlive: boolean;
}

/** gw/devices/list 行。 */
interface DeviceRow {
  deviceId: string;
  name: string;
  scope: 'read' | 'interact' | 'full';
  pairedAt: number;
  lastSeenAt: number;
}

/** gw/pairing/start 数据（qr 模式）。 */
interface PairingSession {
  pairingId: string;
  qrPayload: string;
  expiresAt: number;
}

/** preload gateway 面形状。 */
interface GatewayFace {
  status(): Promise<{ process: string; connected: boolean; staleSocket: boolean }>;
  command(payload: { command: string; args?: Record<string, unknown> }): Promise<GatewayResult>;
}

const SCOPE_LABEL: Record<string, string> = { read: '只读', interact: '可交互', full: '全权' };

const now = (): number => Date.now();

/**
 * 设备与连接（remote-access owner 面板）：网关状态、发起配对（QR 载荷展示 + SAS 确认）、
 * 已配对设备管理（改档/撤销）。数据全部经 gateway owner socket（桌面 = 全权 owner）。
 */
export function DevicesSection(): React.ReactElement {
  const gateway = (typeof window !== 'undefined' ? window.pai.gateway : undefined) as GatewayFace | undefined;
  const [status, setStatus] = React.useState<GatewayStatus | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [devices, setDevices] = React.useState<DeviceRow[]>([]);
  const [pairing, setPairing] = React.useState<PairingSession | null>(null);
  const [pairingScope, setPairingScope] = React.useState<'read' | 'interact' | 'full'>('interact');
  const [sasInput, setSasInput] = React.useState('');
  const [pairingError, setPairingError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback((): void => {
    if (gateway === undefined) return;
    void gateway.status().then((state) => {
      setConnected(state.connected);
    });
    void gateway.command({ command: 'gw/status' }).then((result) => {
      if (result.ok) setStatus(result.body as unknown as GatewayStatus);
    });
    void gateway.command({ command: 'gw/devices/list' }).then((result) => {
      if (result.ok && Array.isArray(result.body['devices'])) setDevices((result.body['devices'] as DeviceRow[]).filter((row) => typeof row?.deviceId === 'string'));
    });
  }, [gateway]);

  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // 配对会话 120s 单次——倒计时到期清面
  React.useEffect(() => {
    if (pairing === null) return;
    const timer = setInterval(() => {
      if (pairing.expiresAt <= now()) setPairing(null);
    }, 1_000);
    return () => clearInterval(timer);
  }, [pairing]);

  const startPairing = (): void => {
    if (gateway === undefined || busy) return;
    setBusy(true);
    setPairingError(null);
    setSasInput('');
    void gateway
      .command({ command: 'gw/pairing/start', args: { scope: pairingScope, mode: 'qr' } })
      .then((result) => {
        if (!result.ok) {
          setPairingError(result.reason);
          return;
        }
        const body = result.body as { pairingId?: string; qrPayload?: string };
        if (typeof body.pairingId !== 'string' || typeof body.qrPayload !== 'string') {
          setPairingError('bad pairing response');
          return;
        }
        setPairing({ pairingId: body.pairingId, qrPayload: body.qrPayload, expiresAt: now() + 120_000 });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const confirmSas = (): void => {
    if (gateway === undefined || pairing === null || busy) return;
    setBusy(true);
    void gateway
      .command({ command: 'gw/pairing/confirm', args: { pairingId: pairing.pairingId, ownerTypedSas: sasInput.trim() } })
      .then((result) => {
        if (!result.ok) {
          setPairingError(result.reason);
          return;
        }
        const body = result.body as { success?: boolean; reason?: string };
        if (body.success !== true) {
          setPairingError(body.reason ?? 'sas mismatch');
          return;
        }
        setPairing(null);
        setSasInput('');
        setPairingError(null);
        refresh();
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const revokeDevice = (deviceId: string): void => {
    if (gateway === undefined) return;
    void gateway.command({ command: 'gw/devices/revoke', args: { deviceId } }).then(() => {
      refresh();
    });
  };

  const setScope = (deviceId: string, scope: string): void => {
    if (gateway === undefined) return;
    void gateway.command({ command: 'gw/devices/set_scope', args: { deviceId, scope } }).then(() => {
      refresh();
    });
  };

  const cancelPairing = (): void => {
    if (gateway === undefined || pairing === null) return;
    void gateway.command({ command: 'gw/pairing/cancel', args: { pairingId: pairing.pairingId } });
    setPairing(null);
    setPairingError(null);
  };

  const copyPayload = (): void => {
    if (pairing === null) return;
    void navigator.clipboard?.writeText(pairing.qrPayload);
  };

  if (gateway === undefined) {
    return (
      <section>
        <SettingsPageHeader title={copy.settings.devicesTitle} description={copy.settings.devicesDesc} />
        <SettingsCard className="px-[20px] py-[16px]">
          <p className="text-[13px] text-muted-foreground">{copy.settings.gatewayUnavailable}</p>
        </SettingsCard>
      </section>
    );
  }

  return (
    <section>
      <SettingsPageHeader title={copy.settings.devicesTitle} description={copy.settings.devicesDesc} />
      <div className="flex flex-col gap-[16px]">
        <SettingsCard className="px-[20px] py-[16px]">
          <SettingsRow title={copy.settings.gatewayStatusTitle} description={copy.settings.gatewayStatusHint}>
            <span className={`inline-block h-[8px] w-[8px] rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-400'}`} aria-hidden />
            <span className="text-[12px] text-muted-foreground">{connected ? copy.settings.gatewayOnline : copy.settings.gatewayOffline}</span>
          </SettingsRow>
          {status !== null ? (
            <SettingsRow title={copy.settings.gatewayInfoTitle} description={`${copy.settings.gatewayInfoHint}（${status.remoteEnabled ? copy.settings.remoteOn : copy.settings.remoteOff}）`}>
              <span className="text-[12px] text-muted-foreground">
                {copy.settings.gatewayDevices} {status.devices} · {copy.settings.gatewayThreads} {status.threads}
              </span>
            </SettingsRow>
          ) : null}
        </SettingsCard>

        <SettingsCard className="px-[20px] py-[16px]">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{copy.settings.pairTitle}</p>
              <p className="mt-[2px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.pairHint}</p>
            </div>
            <ActionButton size="sm" onClick={startPairing} disabled={busy || pairing !== null}>
              <QrCode className="h-[13px] w-[13px]" aria-hidden />
              {copy.settings.pairStart}
            </ActionButton>
          </div>
          <div className="mt-[8px] flex gap-[8px]">
            {(['read', 'interact', 'full'] as const).map((scope) => (
              <ActionButton key={scope} size="sm" variant={pairingScope === scope ? 'solid' : 'outline'} onClick={() => { setPairingScope(scope); }}>
                {SCOPE_LABEL[scope] ?? scope}
              </ActionButton>
            ))}
          </div>
          {pairing !== null ? (
            <div className="mt-[14px] flex flex-col gap-[10px]">
              <p className="text-[12px] text-muted-foreground">{copy.settings.pairShowPayload}</p>
              <div className="flex items-center gap-[10px]">
                <code className="max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface-subtle px-[10px] py-[8px] text-[11px] text-foreground">
                  {pairing.qrPayload.slice(0, 96)}…
                </code>
                <ActionButton size="sm" variant="outline" onClick={copyPayload}>
                  {copy.settings.pairCopy}
                </ActionButton>
              </div>
              <div className="flex items-center gap-[8px]">
                <input
                  aria-label={copy.settings.sasInputLabel}
                  className="w-[140px] rounded-lg border border-border bg-transparent px-[10px] py-[8px] text-[15px] tracking-[0.3em] text-foreground"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => { setSasInput(event.target.value.replace(/\D/g, '').slice(0, 6)); }}
                  placeholder="000000"
                  value={sasInput}
                />
                <ActionButton size="sm" onClick={confirmSas} disabled={sasInput.length !== 6 || busy}>
                  <KeyRound className="h-[13px] w-[13px]" aria-hidden />
                  {copy.settings.sasConfirm}
                </ActionButton>
                <ActionButton size="sm" variant="outline" onClick={cancelPairing}>
                  {copy.settings.pairCancel}
                </ActionButton>
              </div>
              <p className="text-[12px] text-muted-foreground">{copy.settings.sasWaitHint}</p>
            </div>
          ) : null}
          {pairingError !== null ? <p className="mt-[10px] text-[12px] text-destructive">{pairingError}</p> : null}
        </SettingsCard>

        <SettingsCard className="px-[20px] py-[16px]">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{copy.settings.pairedTitle}</p>
              <p className="mt-[2px] text-[12px] text-muted-foreground">{copy.settings.pairedHint}</p>
            </div>
            <ActionButton size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="h-[13px] w-[13px]" aria-hidden />
              {copy.settings.refresh}
            </ActionButton>
          </div>
          <div className="mt-[10px] flex flex-col gap-[6px]">
            {devices.length > 0 ? (
              devices.map((device) => (
                <div key={device.deviceId} className="flex items-center gap-[10px] rounded-lg border border-border px-[12px] py-[8px]">
                  <Smartphone className="h-[15px] w-[15px] text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-foreground">{device.name}</p>
                    <p className="text-[11px] text-muted-foreground">{SCOPE_LABEL[device.scope] ?? device.scope} · {new Date(device.lastSeenAt).toLocaleString()}</p>
                  </div>
                  <ActionButton size="sm" variant="outline" onClick={() => { setScope(device.deviceId, device.scope === 'read' ? 'interact' : 'read'); }}>
                    {device.scope === 'read' ? copy.settings.scopeUpgrade : copy.settings.scopeDowngrade}
                  </ActionButton>
                  <ActionButton size="sm" variant="outline" onClick={() => { revokeDevice(device.deviceId); }}>
                    <ShieldOff className="h-[13px] w-[13px]" aria-hidden />
                    {copy.settings.revoke}
                  </ActionButton>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-muted-foreground">{copy.settings.pairedEmpty}</p>
            )}
          </div>
        </SettingsCard>
      </div>
    </section>
  );
}
