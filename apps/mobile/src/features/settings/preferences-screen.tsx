import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ContentCard } from '@/components/ui/content-card';
import { SectionHeader } from '@/components/ui/section-header';
import { ToggleRow } from '@/components/ui/toggle-row';
import { SettingsThinkingSheet } from '@/features/settings/settings-thinking-sheet';
import { SettingsPermissionSheet } from '@/features/settings/settings-permission-sheet';
import { useNavigationStore } from '@/store/navigation-store';
import { useSettingsStore } from '@/store/settings-store';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { models, thinkingLevels } from '@/strings/zh';

export function PreferencesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const settings = useSettingsStore();
  const openSheet = useNavigationStore((state) => state.openSheet);
  const model = models.find((item) => item.id === settings.defaultModel);
  const thinking = thinkingLevels.find((item) => item.id === settings.defaultThinking);
  const permission = { ask: '每次询问', auto: '自动批准', plan: '仅规划' }[settings.defaultPermission];
  return (
    <>
      <View style={{ backgroundColor: colors.settingsBackground, flex: 1 }}>
        <PageHeader title="偏好设置" />
        <ScrollView contentContainerStyle={{ padding: spacing.xs3 }}>
          <SectionHeader title="默认任务行为" />
          <ContentCard items={[
            { detail: '新对话使用的模型', label: '默认模型', onPress: () => router.push('/models'), trailing: model?.name ?? '选择' },
            { detail: '新对话的思考强度', label: '默认思考强度', onPress: () => openSheet('settings-thinking'), trailing: thinking?.label ?? '选择' },
            { detail: '新对话的权限模式', label: '默认权限模式', onPress: () => openSheet('settings-permission'), trailing: permission },
          ]} />
          <SectionHeader title="体验" />
          <Card style={{ marginTop: spacing.xs2, overflow: 'hidden' }}><ToggleRow detail="任务完成与权限请求时提醒" label="通知与提醒" value={settings.notifications} onChange={settings.toggleNotifications} /><ToggleRow detail="执行关键操作时提供轻触反馈" label="触感反馈" value={settings.haptics} onChange={settings.toggleHaptics} /><ToggleRow detail="历史抽屉显示更多会话" label="紧凑历史列表" value={settings.compactHistory} onChange={settings.toggleCompactHistory} /></Card>
          <SectionHeader title="语言" />
          <ContentCard items={[{ detail: '当前版本提供简体中文界面', label: '简体中文', selected: true }]} />
        </ScrollView>
      </View>
      <SettingsThinkingSheet />
      <SettingsPermissionSheet />
    </>
  );
}
