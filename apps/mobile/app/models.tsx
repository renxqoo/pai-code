import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Cpu } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { ContentCard } from '@/components/ui/content-card';
import { SectionHeader } from '@/components/ui/section-header';
import { useSettingsStore } from '@/store/settings-store';
import { useAppTheme } from '@/theme/theme-context';
import { models as demoModels } from '@/strings/zh';
import { spacing } from '@/theme/tokens';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { getBridge, useBridgeStatus } from '@/mobile/bridge-runtime';

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export default function ModelsRoute() {
  const { colors } = useAppTheme();
  const selected = useSettingsStore((state) => state.defaultModel);
  const select = useSettingsStore((state) => state.setDefaultModel);
  const demo = useDemoModeStore((state) => state.enabled);
  const { status } = useBridgeStatus();
  const [entries, setEntries] = React.useState<readonly ModelEntry[] | null>(null);

  React.useEffect(() => {
    if (demo || status !== 'ready') return;
    const bridge = getBridge();
    if (bridge === null) return;
    void bridge.client.invoke('model/list', {}).then((outcome: unknown) => {
      const data = outcome as { ok: boolean; data?: unknown };
      if (!data.ok || !Array.isArray(data.data)) return;
      setEntries(
        (data.data as Array<{ provider: string; modelId: string; reasoning?: boolean }>).map((model) => ({
          id: `${model.provider}/${model.modelId}`,
          name: model.modelId,
          provider: model.provider,
          description: model.reasoning === true ? '支持思考模式' : '',
        })),
      );
    });
  }, [demo, status]);

  const list: readonly ModelEntry[] = demo ? demoModels : (entries ?? []);
  const loading = !demo && status === 'ready' && entries === null;

  return (
    <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}>
      <PageHeader title="默认模型" />
      <ScrollView contentContainerStyle={{ padding: spacing.xs3 }}>
        <SectionHeader title="可用模型" />
        {loading ? (
          <View style={{ alignItems: 'center', padding: spacing.xs4 }}>
            <ActivityIndicator color={colors.textFaint} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>正在从电脑端获取模型清单…</Text>
          </View>
        ) : null}
        {!loading && list.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, paddingHorizontal: 3, paddingVertical: spacing.xs2 }}>
            {status === 'ready' ? '电脑端尚未配置模型渠道——在桌面端设置的「渠道」页添加。' : '连接电脑后显示其可用模型（设备与连接页配对）。'}
          </Text>
        ) : null}
        {list.length > 0 ? (
          <ContentCard items={list.map((item) => ({ detail: item.description, icon: Cpu, label: item.name, onPress: () => select(item.id), selected: selected === item.id, trailing: item.provider }))} />
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.xs3 }}>凭据由电脑端受保护的存储管理，Pai Code 不会在手机上显示完整密钥。</Text>
      </ScrollView>
    </View>
  );
}
