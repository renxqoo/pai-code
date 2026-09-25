import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Laptop, Link2, Smartphone } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function DevicesRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="设备与连接" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><Card style={{ padding: spacing.xs4 }}><Smartphone color={colors.success} size={24} /><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 10 }}>这台 iPhone</Text><Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>已连接 Pai Code 工作空间</Text></Card><SectionHeader title="电脑" /><Card style={{ marginTop: spacing.xs2 }}><ListRow detail="通过局域网安全配对" icon={Laptop} label="连接电脑" selected /><ListRow detail="输入电脑显示的配对码" icon={Link2} label="配对新设备" /></Card><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs3 }}>连接后可在桌面端继续当前任务；断线不会影响本地历史与设置。</Text></ScrollView></View>;
}
