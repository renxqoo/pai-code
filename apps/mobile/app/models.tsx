import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { useSettingsStore } from '@/store/settings-store';
import { useAppTheme } from '@/theme/theme-context';
import { models } from '@/strings/zh';
import { spacing } from '@/theme/tokens';

export default function ModelsRoute() {
  const { colors } = useAppTheme();
  const model = useSettingsStore((state) => state.defaultModel);
  const select = useSettingsStore((state) => state.setDefaultModel);
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="默认模型" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><SectionHeader title="可用模型" /><Card>{models.map((item) => <ListRow detail={item.description} key={item.id} label={item.name} onPress={() => select(item.id)} selected={model === item.id} trailing={item.provider} />)}</Card><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: spacing.xs3 }}>凭据由受保护的设备存储管理，Pai Code 不会在设置页面显示完整密钥。</Text></ScrollView></View>;
}
