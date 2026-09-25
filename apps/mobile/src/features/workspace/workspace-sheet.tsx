import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { Folder } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { ListRow } from '@/components/ui/list-row';
import { workspaces } from '@/fixtures/demo-data';
import { useNavigationStore } from '@/store/navigation-store';

export function WorkspaceSheet() {
  const { colors } = useAppTheme();
  const open = useNavigationStore((state) => state.sheet === 'workspace');
  const closeSheet = useNavigationStore((state) => state.closeSheet);
  return (
    <Sheet onClose={closeSheet} title="选择工作空间" visible={open}>
      <Text style={{ color: colors.textMuted, fontSize: 12, paddingBottom: spacing.sm, paddingHorizontal: 3 }}>选择 Pai Code 可以访问的代码目录</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs3 }}>
        {workspaces.map((workspace) => <ListRow detail={workspace.path} icon={Folder} key={workspace.id} label={workspace.name} selected={workspace.connected} onPress={closeSheet} trailing={workspace.connected ? '已连接' : undefined} />)}
      </ScrollView>
    </Sheet>
  );
}
