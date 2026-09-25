import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, CircleUserRound, Gauge, HelpCircle, Info, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { SettingNavigationRow } from '@/components/ui/setting-navigation-row';
import { SettingFooterLink } from '@/components/ui/setting-footer-link';
import { DeviceRow } from '@/features/settings/device-row';
import { PaiMark } from '@/components/brand/pai-mark';
import { IconButton } from '@/components/ui/icon-button';

export function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView testID="settings-scroll" style={{ backgroundColor: colors.background, flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xs7, paddingHorizontal: spacing.xs4, paddingTop: insets.top + spacing.xs2 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 60 }}><IconButton icon={ChevronLeft} label="返回" onPress={() => router.back()} /><Text style={{ color: colors.text, flex: 1, fontSize: 19, fontWeight: '700', textAlign: 'center' }}>设置</Text><View style={{ width: 44 }} /></View>
      <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 76 }}><View style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, height: 44, justifyContent: 'center', width: 44 }}><PaiMark size={34} /></View><View style={{ marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>个人设置</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>ren.wang · Pai Code</Text></View></View>
      <SectionHeader title="账户" />
      <Card style={{ marginBottom: spacing.xs5 }}><SettingNavigationRow detail="头像、昵称与工作偏好" href="/profile" icon={CircleUserRound} label="个人资料" /><SettingNavigationRow detail="查看上下文与使用趋势" href="/usage" icon={Gauge} label="用量" /></Card>
      <SectionHeader title="工作区" />
      <Card style={{ marginBottom: spacing.xs5 }}><SettingNavigationRow detail="主题、模型、思考与权限" href="/preferences" icon={SlidersHorizontal} label="偏好设置" /><SettingNavigationRow detail="浅色、深色或跟随系统" href="/appearance" icon={Palette} label="外观" /><DeviceRow /></Card>
      <SectionHeader title="支持" />
      <Card style={{ marginBottom: spacing.xs5 }}><SettingFooterLink detail="数据使用、权限与密钥" href="/privacy" icon={ShieldCheck} label="隐私与安全" /><SettingFooterLink detail="使用帮助与问题反馈" href="/help" icon={HelpCircle} label="帮助与反馈" /><SettingFooterLink detail="版本、许可与开源信息" href="/about" icon={Info} label="关于 Pai Code" /></Card>
      <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: spacing.xs5, textAlign: 'center' }}>Pai Code 0.1.0 · 本地优先的 AI 编程工作台</Text>
    </ScrollView>
  );
}
