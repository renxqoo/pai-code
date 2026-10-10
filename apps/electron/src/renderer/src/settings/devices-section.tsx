import * as React from 'react';
import QRCode from 'qrcode';

import type { RelayConfig } from '@x3code/contracts';
import { ActionButton } from '@x3code/ui';
import { KeyRound, QrCode, RefreshCw, ShieldOff, Smartphone } from 'lucide-react';

import { copy } from '@/strings';
import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsRow } from './settings-row';

/** gateway owner 命令应答形状（gateway-command IPC）：IPC 层恒 ok:true，真实成败在 body。 */
type GatewayResult = { ok: false; reason: string } | { ok: true; body: Record<string, unknown> };

/**
 * 网关应答判读（单一真相：owner-dispatch 的 response 包裹 `{success, data|error}`）。
 * 失败原因原样透出——曾被形状检查替换成无信息的硬编码兜底文案，排障无从下手。
 */
function gatewayError(result: GatewayResult): string | null {
  if (!result.ok) return result.reason;
  const body = result.body as { success?: unknown; error?: unknown };
  if (body.success === true) return null;
  return typeof body.error === 'string' && body.error.length > 0 ? body.error : copy.settings.pairFailed;
}

/** 成功应答的数据面（`{success:true,data}`）；失败/形状异常 → null。 */
function gatewayData(result: GatewayResult): unknown {
  if (!result.ok) return null;
  const body = result.body as { success?: unknown; data?: unknown };
  return body.success === true ? (body.data ?? null) : null;
}

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

/** gw/pairing/start 数据（qr+manual 双展示）。 */
interface PairingSession {
  pairingId: string;
  qrPayload: string;
  manualCode: string;
  expiresAt: number;
}

/** preload gateway 面形状。 */
interface GatewayFace {
  status(): Promise<{ process: string; connected: boolean; staleSocket: boolean }>;
  command(payload: { command: string; args?: Record<string, unknown> }): Promise<GatewayResult>;
}

export interface DevicesSectionProps {
  /** relay 配置（全局统一：settings.json 唯一真相，读 preferences）。 */
  relay: RelayConfig;
  /** 保存 relay（落 settings.json + 重启网关重载）。返回 true = 已保存。 */
  onRelaySave: (relay: RelayConfig) => Promise<boolean>;
}

const SCOPE_LABEL: Record<string, string> = { read: '只读', interact: '可交互', full: '全权' };

const now = (): number => Date.now();

/**
 * 设备与连接（remote-access owner 面板）：网关状态、发起配对（QR 载荷展示 + SAS 确认）、
 * 已配对设备管理（改档/撤销）。数据全部经 gateway owner socket（桌面 = 全权 owner）。
 */
export function DevicesSection({ relay, onRelaySave }: DevicesSectionProps): React.ReactElement {
  const gateway = (typeof window !== 'undefined' ? window.x3code.gateway : undefined) as GatewayFace | undefined;
  const [status, setStatus] = React.useState<GatewayStatus | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [devices, setDevices] = React.useState<DeviceRow[]>([]);
  const [pairing, setPairing] = React.useState<PairingSession | null>(null);
  const [pairingScope, setPairingScope] = React.useState<'read' | 'interact' | 'full'>('interact');
  const [sasInput, setSasInput] = React.useState('');
  const [qrImage, setQrImage] = React.useState<string | null>(null);
  const [ownerSas, setOwnerSas] = React.useState<string | null>(null);
  const [pairingError, setPairingError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [relayUrl, setRelayUrl] = React.useState(relay.relayUrl);
  const [relayFingerprint, setRelayFingerprint] = React.useState(relay.relayKeyFingerprint);
  const [relayNotice, setRelayNotice] = React.useState<string | null>(null);
  const [relayAdvanced, setRelayAdvanced] = React.useState(relay.relayUrl.length > 0);
  const [relayBusy, setRelayBusy] = React.useState(false);

  // props（偏好面）变化即回写草稿：外部保存（其他面板/另一端）不被本地草稿盖住
  React.useEffect(() => {
    setRelayUrl(relay.relayUrl);
    setRelayFingerprint(relay.relayKeyFingerprint);
  }, [relay.relayUrl, relay.relayKeyFingerprint]);

  const refresh = React.useCallback((): void => {
    if (gateway === undefined) return;
    void gateway.status().then((state) => {
      setConnected(state.connected);
    });
    void gateway.command({ command: 'gw/status' }).then((result) => {
      const data = gatewayData(result);
      if (data !== null && typeof data === 'object') setStatus(data as GatewayStatus);
    });
    void gateway.command({ command: 'gw/devices/list' }).then((result) => {
      // 数据面是行数组（gw-dispatch 直接回 devices 列表），不是 {devices:[…]} 包裹
      const data = gatewayData(result);
      if (Array.isArray(data)) setDevices((data as DeviceRow[]).filter((row) => typeof row?.deviceId === 'string'));
    });
  }, [gateway]);

  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    if (pairing === null) {
      setQrImage(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(pairing.qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 320 }).then((url) => {
      if (!cancelled) setQrImage(url);
    }, () => {
      if (!cancelled) setQrImage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pairing]);

  // 配对会话 120s 单次——倒计时到期清面
  React.useEffect(() => {
    if (pairing === null) return;
    const timer = setInterval(() => {
      if (pairing.expiresAt <= now()) setPairing(null);
    }, 1_000);
    return () => clearInterval(timer);
  }, [pairing]);

  // owner 侧 SAS 轮询：手机 PAKE/QR 请求到达后网关即算出，两端数字供目视比对
  React.useEffect(() => {
    if (gateway === undefined || pairing === null) {
      setOwnerSas(null);
      return;
    }
    let cancelled = false;
    const tick = (): void => {
      void gateway
        .command({ command: 'gw/pairing/status', args: { pairingId: pairing.pairingId } })
        .then((result) => {
          if (cancelled) return;
          const data = gatewayData(result) as { ownerSas?: unknown } | null;
          if (typeof data?.ownerSas === 'string' && data.ownerSas.length > 0) setOwnerSas(data.ownerSas);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, 1_500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gateway, pairing]);

  const startPairing = (): void => {
    if (gateway === undefined || busy) return;
    setBusy(true);
    setPairingError(null);
    setSasInput('');
    void gateway
      .command({ command: 'gw/pairing/start', args: { scope: pairingScope, mode: 'qr' } })
      .then((result) => {
        const failure = gatewayError(result);
        if (failure !== null) {
          setPairingError(failure);
          return;
        }
        const data = gatewayData(result);
        const pairingId = (data as { pairingId?: unknown } | null)?.pairingId;
        const qrPayload = (data as { qrPayload?: unknown } | null)?.qrPayload;
        const manualCode = (data as { manualCode?: unknown } | null)?.manualCode;
        if (typeof pairingId !== 'string' || typeof qrPayload !== 'string') {
          setPairingError(copy.settings.pairBadResponse);
          return;
        }
        setPairing({ pairingId, qrPayload, manualCode: typeof manualCode === 'string' ? manualCode : '', expiresAt: now() + 120_000 });
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
        const failure = gatewayError(result);
        if (failure !== null) {
          setPairingError(failure);
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

  const saveRelay = (): void => {
    if (relayBusy) return;
    setRelayBusy(true);
    setRelayNotice(null);
    void onRelaySave({ remoteEnabled: true, relayUrl: relayUrl.trim(), relayKeyFingerprint: relayFingerprint.trim() }).then((saved) => {
      setRelayNotice(saved ? copy.settings.relaySaved : copy.settings.relaySaveFailed);
    }).finally(() => {
      setRelayBusy(false);
    });
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
              <p className="text-[13px] font-medium text-foreground">{copy.settings.relayCardTitle}</p>
              <p className="mt-[2px] text-[12px] leading-[17px] text-muted-foreground">{copy.settings.relayCardHint}</p>
            </div>
            <ActionButton size="sm" variant="outline" onClick={() => { setRelayAdvanced((v) => !v); }}>
              {relayAdvanced ? copy.settings.relayAdvancedHide : copy.settings.relayAdvancedShow}
            </ActionButton>
          </div>
          {relayAdvanced ? (
            <div className="mt-[10px] flex flex-col gap-[8px]">
              <p className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.relayAdvancedHint}</p>
              <input
                aria-label={copy.settings.relayUrlLabel}
                className="w-full rounded-lg border border-border bg-transparent px-[10px] py-[8px] text-[13px] text-foreground"
                onChange={(event) => { setRelayUrl(event.target.value); }}
                placeholder="wss://relay.example.com"
                value={relayUrl}
              />
              <input
                aria-label={copy.settings.relayFingerprintLabel}
                className="w-full rounded-lg border border-border bg-transparent px-[10px] py-[8px] text-[13px] text-foreground"
                onChange={(event) => { setRelayFingerprint(event.target.value); }}
                value={relayFingerprint}
              />
              <div>
                <ActionButton size="sm" onClick={saveRelay} disabled={relayBusy}>
                  {copy.settings.relaySave}
                </ActionButton>
              </div>
              {relayNotice !== null ? <p className="mt-[4px] text-[12px] text-muted-foreground">{relayNotice}</p> : null}
            </div>
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
              {qrImage !== null ? (
                <div className="flex items-start gap-[14px]">
                  <img alt="pairing qr" className="h-[180px] w-[180px] rounded-lg border border-border bg-white p-[6px]" src={qrImage} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
                    <p className="text-[12px] leading-[17px] text-muted-foreground">手机端「设置 → 设备与连接」扫码，或输入下方 6 位配对码；随后比对两侧数字并在下方确认。</p>
                    {pairing.manualCode.length > 0 ? (
                      <p className="select-all font-mono text-[30px] font-bold tracking-[0.32em] text-foreground">{pairing.manualCode}</p>
                    ) : null}
                    <div>
                      <ActionButton size="sm" variant="outline" onClick={copyPayload}>
                        {copy.settings.pairCopy}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-[10px]">
                  <code className="max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface-subtle px-[10px] py-[8px] text-[11px] text-foreground">
                    {pairing.qrPayload.slice(0, 96)}…
                  </code>
                  <ActionButton size="sm" variant="outline" onClick={copyPayload}>
                    {copy.settings.pairCopy}
                  </ActionButton>
                </div>
              )}
              <div className="flex items-center gap-[8px]">
                {ownerSas !== null ? (
                  <div className="flex flex-col">
                    <span className="select-all font-mono text-[22px] font-bold tracking-[0.3em] text-foreground">{ownerSas}</span>
                    <span className="text-[11px] text-muted-foreground">{copy.settings.sasOwnerLabel}</span>
                  </div>
                ) : null}
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
              <p className="text-[12px] text-muted-foreground">{ownerSas !== null ? copy.settings.sasCompareHint : copy.settings.sasWaitHint}</p>
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
