import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Link2, Laptop, Smartphone } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ContentCard } from '@/components/ui/content-card';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';

export default function DevicesRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}><PageHeader title="设备与连接" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><Card style={{ alignItems: 'center', padding: spacing.xs5 }}><View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 30, height: 60, justifyContent: 'center', width: 60 }}><Smartphone color={colors.text} size={27} /></View><Text style={{ color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 12 }}>这台 iPhone</Text><View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: colors.success, fontSize: 11, fontWeight: '600' }}>已连接</Text></View></Card><SectionHeader title="电脑" /><ContentCard items={[{ detail: '通过局域网安全配对', icon: Laptop, label: '连接电脑', selected: true }, { detail: '输入电脑显示的配对码', icon: Link2, label: '配对新设备' }]} /><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs3 }}>连接后可在桌面端继续当前任务；断线不会影响本地历史与设置。</Text></ScrollView></View>;
}
