import * as React from 'react';
import { View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { TextField } from '@/components/ui/text-field';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function ProfileRoute() {
  const { colors } = useAppTheme();
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="个人资料" /><View style={{ padding: spacing.xs3 }}><SectionHeader title="账户" /><Card style={{ padding: spacing.xs3 }}><TextField defaultValue="ren.wang" label="显示名称" /><View style={{ height: spacing.xs3 }} /><TextField defaultValue="ren.wang@example.com" keyboardType="email-address" label="邮箱" /></Card><SectionHeader title="工作偏好" /><Card style={{ marginTop: spacing.xs2 }}><ListRow detail="agent-app" label="默认工作空间" /><ListRow detail="Asia/Shanghai" label="时区" /></Card></View></View>;
}
