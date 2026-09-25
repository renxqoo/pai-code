import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleUserRound, Gauge, HelpCircle, Info, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ToggleRow } from '@/components/ui/toggle-row';
import { SettingNavigationRow } from '@/components/ui/setting-navigation-row';
import { SettingFooterLink } from '@/components/ui/setting-footer-link';
import { DeviceRow } from '@/features/settings/device-row';
import { PaiMark } from '@/components/brand/pai-mark';
import { useSettingsStore } from '@/store/settings-store';
import type { ThemePreference } from '@/types/domain';

export function SettingsScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  return (
    <ScrollView style={{ backgroundColor: colors.background, flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xs6, paddingHorizontal: spacing.xs3 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 84 }}><View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 25, height: 50, justifyContent: 'center', width: 50 }}><PaiMark size={36} /></View><View style={{ marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>个人设置</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>ren.wang · Pai Code</Text></View></View>
      <SectionHeader title="账户" /><Card><SettingNavigationRow detail="头像、昵称与工作偏好" href="/profile" icon={CircleUserRound} label="个人资料" /><SettingNavigationRow detail="查看上下文与使用趋势" href="/usage" icon={Gauge} label="用量" /></Card>
      <SectionHeader title="Pai Code" /><Card><SettingNavigationRow detail="浅色、深色或跟随系统" href="/appearance" icon={Palette} label="外观" /><SettingNavigationRow detail="默认模型、思考和权限" href="/preferences" icon={SlidersHorizontal} label="偏好设置" /><DeviceRow /></Card>
      <SectionHeader title="偏好" /><Card style={{ marginBottom: spacing.xs3, overflow: 'hidden' }}><View style={{ padding: spacing.xs3 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 9 }}>外观</Text><SegmentedControl options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '系统' }]} value={settings.theme} onChange={(value: ThemePreference) => settings.setTheme(value)} /></View><ToggleRow detail="任务完成与权限请求时提醒" label="通知" value={settings.notifications} onChange={settings.toggleNotifications} /><ToggleRow detail="执行关键操作时提供轻触反馈" label="触感反馈" value={settings.haptics} onChange={settings.toggleHaptics} /></Card>
      <SectionHeader title="安全与支持" /><Card><SettingFooterLink detail="数据使用、权限与密钥" href="/privacy" icon={ShieldCheck} label="隐私与安全" /><SettingFooterLink detail="使用帮助与问题反馈" href="/help" icon={HelpCircle} label="帮助与反馈" /><SettingFooterLink detail="版本、许可与开源信息" href="/about" icon={Info} label="关于 Pai Code" /></Card>
      <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: spacing.xs4, textAlign: 'center' }}>Pai Code 0.1.0 · 本地优先的 AI 编程工作台</Text>
    </ScrollView>
  );
}

