import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyRound, Link2, RefreshCw, Smartphone } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ContentCard } from '@/components/ui/content-card';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/components/ui/button';
import { initializeRelayRuntime, useRelayStatus } from '@/mobile/relay/runtime';
import { Platform } from 'react-native';
import { createPairingSession, generateDeviceIdentity, type PairingStep } from '@/mobile/relay/pairing';
import { relayCredentialsStore } from '@/mobile/relay/credentials';

const STATUS_LABEL: Record<string, string> = {
  disconnected: '未连接',
  connecting: '连接中…',
  connected: '已连接',
};

/** relay 配对面 WS（/pairing——明文信封域；token 是桌面端 QR 码内的 pairingTicket）。 */
function makePairingWire(relayUrl: string, pairingTicket: string) {
  const ws = new WebSocket(`${relayUrl}/pairing?token=${encodeURIComponent(pairingTicket)}`);
  const listeners = new Set<(message: Record<string, unknown>) => void>();
  let openedResolve: ((open: boolean) => void) | null = null;
  const openedPromise = new Promise<boolean>((resolve) => {
    openedResolve = resolve;
  });
  ws.onopen = () => {
    openedResolve?.(true);
  };
  ws.onerror = () => {
    openedResolve?.(false);
  };
  ws.onclose = () => {
    openedResolve?.(false);
  };
  return {
    opened: () => openedPromise,
    send(line: string): void {
      ws.send(line);
    },
    onMessage(listener: (message: Record<string, unknown>) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close(): void {
      ws.close();
    },
    wire(): void {
      ws.onmessage = (event: unknown) => {
        const line = String((event as { data: unknown }).data);
        try {
          const envelope = JSON.parse(line) as { payload?: string };
          if (typeof envelope.payload === 'string') {
            for (const listener of listeners) {
              listener(JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8')) as Record<string, unknown>);
            }
          }
        } catch {
          // 半包/垃圾帧：丢弃（配对面帧小，不做跨帧缓冲）
        }
      };
    },
  };
}

export default function DevicesRoute() {
  const { colors } = useAppTheme();
  const { status, runtime } = useRelayStatus();
  const [relayHost, setRelayHost] = React.useState('');
  const [pairCode, setPairCode] = React.useState('');
  const [pairPayload, setPairPayload] = React.useState('');
  const [pairing, setPairing] = React.useState(false);
  const [pairError, setPairError] = React.useState<string | null>(null);
  const [sas, setSas] = React.useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = React.useState(relayCredentialsStore.load() !== null);
  React.useEffect(() => {
    // preload 完成后（未配对态无 status 事件）随 status 变化刷新（M4）
    setHasCredentials(relayCredentialsStore.load() !== null);
  }, [status]);

  const connected = status === 'connected' || status === 'ready';

  const pairingInFlightRef = React.useRef(false);

  const pairWithTicket = async (relayUrl: string, pairingId: string, installationId: string, ticket: string, gatewayEphemeralPub?: string, manualCode?: string): Promise<void> => {
    if (pairingInFlightRef.current) return; // 同帧双击防抖（M3）
    pairingInFlightRef.current = true;
    setPairing(true);
    setPairError(null);
    setSas(null);
    let wire: ReturnType<typeof makePairingWire> | null = null;
    try {
      wire = makePairingWire(relayUrl, ticket);
      wire.wire();
      const identity = generateDeviceIdentity();
      const session = createPairingSession({
        wire: wire as never,
        endpoints: { relayUrl, installationId },
        pairingId,
        ...(gatewayEphemeralPub !== undefined ? { gatewayEphemeralPub } : {}),
        deviceInfo: { name: identity.deviceId, deviceType: 'phone', platform: Platform.OS, appVersion: '1' },
      });
      session.onStep((step: PairingStep) => {
        if (step.phase === 'sas-shown') setSas(step.sas);
        if (step.phase === 'failed') setPairError(step.reason);
      });
      if (manualCode !== undefined) {
        await session.startManual(manualCode, identity.deviceId);
      }
      // SAS 展示后呈递长期钥（owner 在桌面端按 SAS 确认）
      await session.submitDeviceKeys(identity);
      const registered = await session.waitRegistered();
      if (!registered.ok) {
        setPairError(`配对未完成：${registered.reason}`);
        session.close();
        return;
      }
      const saved = await relayCredentialsStore.save({
        deviceId: session.registeredDeviceId ?? identity.deviceId,
        signingSecret: identity.signingSecret,
        signingPub: identity.signingPub,
        sharedSecretHex: registered.sharedSecret,
        installationId,
        relayUrl,
        relayToken: session.relayToken ?? '',
      });
      if (!saved) setPairError('凭证保存失败（本会话可用，重启后需重新配对）');
      setHasCredentials(true);
      session.close();
      void initializeRelayRuntime().connectWithCredentials(session.relayToken ?? '');
    } catch (error) {
      wire?.close();
      setPairError(error instanceof Error ? error.message : '配对失败');
    } finally {
      setPairing(false);
      pairingInFlightRef.current = false;
    }
  };

  const forget = (): void => {
    void relayCredentialsStore.clear();
    setHasCredentials(false);
    runtime?.disconnect();
  };

  return (
    <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}>
      <PageHeader title="设备与连接" />
      <ScrollView contentContainerStyle={{ padding: spacing.xs3 }}>
        <Card style={{ alignItems: 'center', padding: spacing.xs5 }}>
          <View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 30, height: 60, justifyContent: 'center', width: 60 }}>
            <Smartphone color={colors.text} size={27} />
          </View>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 12 }}>这台 iPhone</Text>
          <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: connected ? colors.success : colors.textMuted, fontSize: 11, fontWeight: '600' }}>
              {connected ? '已连接 · 经 relay 中继' : STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </Card>

        <SectionHeader title="连接" />
        {hasCredentials ? (
          <ContentCard
            items={[
              {
                detail: connected ? '端到端加密通道已建立' : status === 'connecting' ? '正在经 relay 连接桌面端…' : '点按重连（需桌面端网关在线）',
                icon: Link2,
                label: connected ? '已连接' : '重新连接',
                onPress: () => {
                  const credentials = relayCredentialsStore.load();
                  if (credentials !== null) void initializeRelayRuntime().connectWithCredentials(credentials.relayToken);
                },
                selected: connected,
              },
              { detail: '删除本机配对凭证（桌面端同步撤销）', icon: RefreshCw, label: '取消配对', onPress: forget },
            ]}
          />
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: 3, paddingBottom: spacing.sm }}>尚未配对——在桌面端「设置 → 设备与连接」发起配对，然后扫码或输入配对码。</Text>
        )}

        <SectionHeader title="配对（扫码载荷或 8 位码）" />
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.xs2, paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="配对载荷"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => setPairPayload(value.trim())}
            placeholder="粘贴桌面端配对码（{relayUrl,pairingId,…}）
或手输 8 位码 + relay 地址"
            placeholderTextColor={colors.textFaint}
            multiline
            style={{ color: colors.text, fontSize: 13, minHeight: 60, padding: 10, textAlignVertical: 'top' }}
            value={pairPayload}
          />
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.xs2, paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="配对码"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            onChangeText={(value) => setPairCode(value.toUpperCase())}
            placeholder="如 ABCD-EFGH"
            placeholderTextColor={colors.textFaint}
            style={{ color: colors.text, fontSize: 15, letterSpacing: 2, minHeight: 46, textAlign: 'center' }}
            value={pairCode}
          />
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.xs2, paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="服务器地址"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => setRelayHost(value.trim())}
            placeholder="relay 地址（如 relay.example.com 或 ws://ip:端口）"
            placeholderTextColor={colors.textFaint}
            style={{ color: colors.text, fontSize: 14, minHeight: 46 }}
            value={relayHost}
          />
        </View>
        <Button
          containerStyle={{ flex: 1 }}
          disabled={pairing || pairPayload.length === 0}
          label={pairing ? '配对中…' : '配对'}
          onPress={() => {
            // 手输码路径：gateway 经 relay 转发配对面（pairingTicket 由桌面端发起时生成）
            if (pairPayload.length > 0) {
              try {
                const payload = JSON.parse(pairPayload) as { relayUrl?: string; pairingId?: string; installationId?: string; gatewayEphemeralPub?: string; pairingTicket?: string; code?: string };
                if (typeof payload.relayUrl === 'string' && typeof payload.pairingId === 'string' && typeof payload.installationId === 'string' && payload.installationId.length > 0) {
                  void pairWithTicket(payload.relayUrl, payload.pairingId, payload.installationId, payload.pairingTicket ?? '', typeof payload.gatewayEphemeralPub === 'string' ? payload.gatewayEphemeralPub : undefined, typeof payload.code === 'string' ? payload.code : undefined);
                  return;
                }
                setPairError('配对载荷缺少 relayUrl/pairingId/installationId');
                return;
              } catch {
                setPairError('配对载荷不是合法 JSON');
                return;
              }
            }
            if (relayHost.length === 0) {
              setPairError('手输码模式需同时填 relay 地址');
              return;
            }
            // 手输码路径（M6 接线）：需 installationId（gw_ 地址域）——载荷缺省时经
            // gateway 节点发现不可行（ pairing 面无该面），要求载荷或扫码承载
            setPairError('手输码需配对载荷（含 installationId）——从桌面端复制完整配对码后粘贴');
          }}
          size="small"
        />
        {pairing ? <ActivityIndicator color={colors.textFaint} style={{ marginTop: spacing.sm }} /> : null}
        {sas !== null ? (
          <Card style={{ alignItems: 'center', marginTop: spacing.sm, padding: spacing.xs4 }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
              <KeyRound color={colors.success} size={16} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>比对桌面端数字</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 34, fontWeight: '700', letterSpacing: 8, marginTop: 8 }}>{sas}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, textAlign: 'center' }}>两串数字一致时在桌面端点「确认」完成配对</Text>
          </Card>
        ) : null}
        {pairError !== null ? <Text style={{ color: colors.destructive, fontSize: 12, marginTop: spacing.sm }}>{pairError}</Text> : null}

        <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 6, marginTop: spacing.xs3 }}>
          <Link2 color={colors.textFaint} size={14} />
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 }}>
            连接经自建 relay 中继（非局域网也可用），全程端到端加密——relay 只见路由信息。断线不影响桌面端会话。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
