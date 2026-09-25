import * as React from 'react';
import { Text, View } from 'react-native';
import { Menu, SlidersHorizontal } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { layout, spacing } from '@/theme/tokens';
import { IconButton } from '@/components/ui/icon-button';
import { useNavigationStore } from '@/store/navigation-store';
import { useConversationStore } from '@/store/conversation-store';

export function ChatHeader() {
  const { colors } = useAppTheme();
  const setDrawerOpen = useNavigationStore((state) => state.setDrawerOpen);
  const openSheet = useNavigationStore((state) => state.openSheet);
  const title = useConversationStore((state) => state.session.title);
  const project = useConversationStore((state) => state.session.project);
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', height: layout.minTouch + 16, paddingHorizontal: spacing.xs4 }}>
      <IconButton icon={Menu} label="打开对话历史" onPress={() => setDrawerOpen(true)} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{project}</Text>
      </View>
      <IconButton icon={SlidersHorizontal} label="任务配置" onPress={() => openSheet('task-config')} />
    </View>
  );
}
