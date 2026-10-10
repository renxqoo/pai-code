import * as React from 'react';
import { Text, TextInput, View } from 'react-native';
import { Folder } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { ContentCard } from '@/components/ui/content-card';
import { useNavigationStore } from '@/store/navigation-store';
import { useConversationStore } from '@/store/conversation-store';
import { filterWorkspaces } from '@/features/workspace/known-workspaces';
import { useKnownWorkspaces } from '@/features/workspace/use-known-workspaces';
import { WorkspaceEmptyState } from '@/features/workspace/workspace-empty-state';
import { copy } from '@/strings/zh';

/**
 * 工作空间候选 = PC 侧已建过会话的 cwd（thread/list 真值面）。设备端不能枚举
 * 电脑目录（无 dialog/pickDirectory，也够不着 ownerOnly 的 workspace/trust），
 * 故只提供选择，不提供新建目录。
 */
export function WorkspaceSheet() {
  const { colors } = useAppTheme();
  const open = useNavigationStore((state) => state.sheet === 'workspace');
  const closeSheet = useNavigationStore((state) => state.closeSheet);
  const workspaceId = useConversationStore((state) => state.workspaceId);
  const chooseWorkspace = useConversationStore((state) => state.chooseWorkspace);
  const [query, setQuery] = React.useState('');
  const workspaces = useKnownWorkspaces();
  const visible = React.useMemo(() => filterWorkspaces(workspaces, query), [workspaces, query]);
  const pick = React.useCallback((path: string, name: string) => {
    chooseWorkspace(path, name, path);
    closeSheet();
    setQuery('');
  }, [chooseWorkspace, closeSheet]);
  return (
    <Sheet onClose={closeSheet} title={copy.selectWorkspace} visible={open}>
      <Text style={{ color: colors.textMuted, fontSize: 12, paddingBottom: spacing.sm, paddingHorizontal: 3 }}>{copy.workspaceHintText}</Text>
      <View>
        <View style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, flexDirection: 'row', marginBottom: spacing.sm, paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel="搜索工作空间"
            autoCapitalize="none"
            onChangeText={setQuery}
            placeholder={copy.workspaceSearchPlaceholder}
            placeholderTextColor={colors.textFaint}
            returnKeyType="search"
            style={{ color: colors.text, flex: 1, fontSize: 14, minHeight: 44, padding: 10 }}
            value={query}
          />
        </View>
        {visible.length === 0
          ? (workspaces.length === 0 ? <WorkspaceEmptyState /> : <Text style={{ color: colors.textFaint, fontSize: 12, paddingHorizontal: 3, paddingVertical: spacing.xs2 }}>{copy.workspaceNoMatch}</Text>)
          : <ContentCard items={visible.map((workspace) => ({ detail: workspace.path, icon: Folder, label: workspace.name, onPress: () => { pick(workspace.path, workspace.name); }, selected: workspaceId === workspace.path }))} />}
      </View>
    </Sheet>
  );
}