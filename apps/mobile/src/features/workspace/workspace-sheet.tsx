import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { Folder } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { ContentCard } from '@/components/ui/content-card';
import { workspaces } from '@/fixtures/demo-data';
import { useNavigationStore } from '@/store/navigation-store';
import { useConversationStore } from '@/store/conversation-store';

export function WorkspaceSheet() {
  const { colors } = useAppTheme();
  const open = useNavigationStore((state) => state.sheet === 'workspace');
  const closeSheet = useNavigationStore((state) => state.closeSheet);
  const workspaceId = useConversationStore((state) => state.workspaceId);
  const chooseWorkspace = useConversationStore((state) => state.chooseWorkspace);
  return (
    <Sheet onClose={closeSheet} title="选择工作空间" visible={open}>
      <Text style={{ color: colors.textMuted, fontSize: 12, paddingBottom: spacing.sm, paddingHorizontal: 3 }}>选择 Pai Code 可以访问的代码目录</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs3 }}>
        <ContentCard items={workspaces.map((workspace) => ({ detail: workspace.path, icon: Folder, label: workspace.name, onPress: () => { chooseWorkspace(workspace.id, workspace.name); closeSheet(); }, selected: workspaceId === workspace.id }))} />
      </ScrollView>
    </Sheet>
  );
}
