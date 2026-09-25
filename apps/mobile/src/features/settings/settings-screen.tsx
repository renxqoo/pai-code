import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, CircleUserRound, Gauge, HelpCircle, Info, MonitorCog, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { IconButton } from '@/components/ui/icon-button';
import { SectionHeader } from '@/components/ui/section-header';
import { SettingsCard, type SettingsItem } from '@/components/ui/settings-card';

const accountItems: readonly SettingsItem[] = [
  { label: '个人资料', detail: '头像、昵称与工作偏好', icon: CircleUserRound, href: '/profile' },
  { label: '用量', detail: '查看上下文与使用趋势', icon: Gauge, href: '/usage' },
];

const workspaceItems: readonly SettingsItem[] = [
  { label: '偏好设置', detail: '默认模型、思考与交互', icon: SlidersHorizontal, href: '/preferences' },
  { label: '外观', detail: '浅色、深色或跟随系统', icon: Palette, href: '/appearance' },
  { label: '设备与连接', detail: '当前设备与桌面端连接', icon: MonitorCog, href: '/devices' },
];

const supportItems: readonly SettingsItem[] = [
  { label: '隐私与安全', detail: '数据使用、权限与凭据', icon: ShieldCheck, href: '/privacy' },
  { label: '帮助与反馈', detail: '使用帮助与问题反馈', icon: HelpCircle, href: '/help' },
  { label: '关于 Pai Code', detail: '版本、许可与开源信息', icon: Info, href: '/about' },
];

export function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView testID="settings-scroll" style={{ backgroundColor: colors.settingsBackground, flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xs8, paddingHorizontal: spacing.xs4, paddingTop: insets.top + spacing.xs2 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 64 }}><IconButton icon={ChevronLeft} label="返回" onPress={() => router.back()} /><Text style={{ color: colors.text, flex: 1, fontSize: 19, fontWeight: '700', textAlign: 'center' }}>设置</Text><View style={{ width: 44 }} /></View>
      <SectionHeader title="账户" /><SettingsCard items={accountItems} />
      <SectionHeader title="工作区" /><SettingsCard items={workspaceItems} />
      <SectionHeader title="支持" /><SettingsCard items={supportItems} />
      <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: spacing.xs5, textAlign: 'center' }}>Pai Code 0.1.0 · 本地优先的 AI 编程工作台</Text>
    </ScrollView>
  );
}
