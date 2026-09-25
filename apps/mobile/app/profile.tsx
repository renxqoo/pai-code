import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Mail, UserRound } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ContentCard } from '@/components/ui/content-card';
import { TextField } from '@/components/ui/text-field';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function ProfileRoute() {
  const { colors } = useAppTheme();
  return (
    <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}>
      <PageHeader title="个人资料" />
      <ScrollView contentContainerStyle={{ padding: spacing.xs3 }}>
        <SectionHeader title="账户" />
        <Card style={{ padding: spacing.xs4 }}><View style={{ alignItems: 'center', marginBottom: spacing.xs5 }}><View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 32, height: 64, justifyContent: 'center', width: 64 }}><UserRound color={colors.text} size={28} /></View><Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 10 }}>ren.wang</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>Pai Code 用户</Text></View><TextField defaultValue="ren.wang" label="显示名称" /><View style={{ height: spacing.xs3 }} /><TextField defaultValue="ren.wang@example.com" keyboardType="email-address" label="邮箱" /></Card>
        <SectionHeader title="工作偏好" />
        <ContentCard items={[{ detail: 'Asia/Shanghai', icon: Mail, label: '时区' }, { detail: '简体中文', label: '界面语言' }]} />
      </ScrollView>
    </View>
  );
}
