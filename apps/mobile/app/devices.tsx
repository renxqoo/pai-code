import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { Link2, Laptop, RefreshCw, Smartphone } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ContentCard } from '@/components/ui/content-card';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/components/ui/button';
import { bridgeStorage } from '@/mobile/transport/bridge-storage';
import { initializeBridge, loadBootstrap, useBridgeStatus } from '@/mobile/bridge-runtime';

const STATUS_LABEL: Record<string, string> = {
  disconnected: '未连接',
  connecting: '连接中…',
  authenticating: '验证身份…',
  ready: '已连接',
};

export default function DevicesRoute() {
  const { colors } = useAppTheme();
  const { status, serverInfo, runtime } = useBridgeStatus();
  const [host, setHost] = React.useState(bridgeStorage.loadHost());
  const [code, setCode] = React.useState('');
  const [pairing, setPairing] = React.useState(false);
  const [pairError, setPairError] = React.useState<string | null>(null);
  const [savedToken, setSavedToken] = React.useState<string | null>(bridgeStorage.loadToken());

  const tryConnect = React.useCallback((token: string | null) => {
    const bridge = initializeBridge();
    if (host.trim().length === 0 || (token === null && bridgeStorage.loadToken() === null)) {
      // 无令牌：仅建立 socket（配对面用）
      bridge.connect(`ws://${host.trim() || '127.0.0.1'}:8787`, null);
      return;
    }
    bridge.connect(`ws://${host.trim()}:8787`, token ?? bridgeStorage.loadToken());
  }, [host]);

  // 首次进入自动尝试已存令牌
  React.useEffect(() => {
    const token = bridgeStorage.loadToken();
    if (token !== null && host.trim().length > 0) tryConnect(token);
    else initializeBridge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ready 后装载启动数据
  React.useEffect(() => {
    if (status === 'ready' && runtime !== null) void loadBootstrap(runtime.client);
  }, [status, runtime]);

  const pair = async (): Promise<void> => {
    setPairing(true);
    setPairError(null);
    try {
      const bridge = initializeBridge();
      if (bridge.status === 'disconnected') tryConnect(savedToken);
      // 等 socket 通（连接中重试几次）
      for (let i = 0; i < 20 && bridge.status === 'disconnected'; i += 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });
      }
      const result = await bridge.pair(code.trim());
      if (result.ok) {
        bridgeStorage.saveToken(result.token);
        bridgeStorage.saveHost(host.trim());
        setSavedToken(result.token);
        bridge.connect(`ws://${host.trim()}:8787`, result.token);
      } else {
        setPairError(result.reason === 'code_mismatch' ? '配对码不正确' : result.reason === 'code_expired' ? '配对码已过期，请在电脑端重新生成' : result.reason === 'locked' ? '尝试次数过多，请 5 分钟后再试' : `配对失败：${result.reason}`);
      }
    } finally {
      setPairing(false);
    }
  };

  const forget = (): void => {
    bridgeStorage.clear();
    setSavedToken(null);
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
            <Text style={{ color: status === 'ready' ? colors.success : colors.textMuted, fontSize: 11, fontWeight: '600' }}>
              {status === 'ready' ? `已连接 · 桌面端 v${serverInfo?.appVersion ?? '?'}` : STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </Card>

        <SectionHeader title="电脑" />
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.xs2, paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="电脑地址"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setHost}
            onSubmitEditing={() => tryConnect(savedToken)}
            placeholder="电脑 IP（如 192.168.1.100）"
            placeholderTextColor={colors.textFaint}
            returnKeyType="done"
            style={{ color: colors.text, fontSize: 14, minHeight: 46 }}
            value={host}
          />
        </View>
        <ContentCard
          items={[
            {
              detail: status === 'ready' ? '已建立安全连接' : savedToken !== null ? '点击使用已保存的令牌重连' : '需要先完成配对',
              icon: Laptop,
              label: '连接电脑',
              onPress: () => tryConnect(savedToken),
              selected: status === 'ready',
            },
          ]}
        />
        {savedToken !== null ? (
          <ContentCard
            items={[
              { detail: '删除本机保存的配对令牌', icon: RefreshCw, label: '取消配对', onPress: forget },
            ]}
          />
        ) : null}

        <SectionHeader title="配对新设备" />
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.xs2, paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="配对码"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => setCode(value.replace(/[^0-9]/g, ''))}
            placeholder="输入电脑端显示的 6 位配对码"
            placeholderTextColor={colors.textFaint}
            style={{ color: colors.text, fontSize: 14, letterSpacing: 4, minHeight: 46, textAlign: 'center' }}
            value={code}
          />
        </View>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
          <Button containerStyle={{ flex: 1 }} disabled={code.length !== 6 || pairing || host.trim().length === 0} label={pairing ? '配对中…' : '配对'} onPress={() => void pair()} size="small" />
        </View>
        {pairing ? <ActivityIndicator color={colors.textFaint} style={{ marginTop: spacing.sm }} /> : null}
        {pairError !== null ? <Text style={{ color: colors.destructive, fontSize: 12, marginTop: spacing.sm }}>{pairError}</Text> : null}

        <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 6, marginTop: spacing.xs3 }}>
          <Link2 color={colors.textFaint} size={14} />
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 }}>
            配对码在桌面端「设备与连接」页生成（5 分钟内有效、一次性）。连接后可在手机上继续电脑端的任务；断线不会影响电脑端会话。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
