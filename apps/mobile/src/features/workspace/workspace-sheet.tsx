import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { Folder } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Sheet } from '@/components/ui/sheet';
import { ContentCard } from '@/components/ui/content-card';
import { useNavigationStore } from '@/store/navigation-store';
import { useConversationStore } from '@/store/conversation-store';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { workspaces } from '@/fixtures/demo-data';
import { useHistoryStore } from '@/store/history-store';
import { copy } from '@/strings/zh';

interface ProjectHit {
  path: string;
  name: string;
}

/** PC 侧会话已用工作区（会话列表 project 字段即 cwd 真值）。 */
function knownCwds(): readonly string[] {
  return [...new Set(useHistoryStore.getState().sessions.map((session) => session.project).filter((path) => path.length > 0))];
}

export function WorkspaceSheet() {
  const { colors } = useAppTheme();
  const open = useNavigationStore((state) => state.sheet === 'workspace');
  const closeSheet = useNavigationStore((state) => state.closeSheet);
  const workspaceId = useConversationStore((state) => state.workspaceId);
  const chooseWorkspace = useConversationStore((state) => state.chooseWorkspace);
  const demo = useDemoModeStore((state) => state.enabled);
  const [search, setSearch] = React.useState('');
  const [hits, setHits] = React.useState<readonly ProjectHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  /**
   * 工作空间候选 = PC 侧会话已用过的 cwd（thread/list 真值面）。
   * 手机端不发目录搜索/选择器请求：file/search 与 dialog/pickDirectory 是桌面端
   * 本地能力（electron main 端口），设备面不可达——留按钮只会永远失败。
   */
  const runSearch = React.useCallback(() => {
    const query = search.trim().toLowerCase();
    setSearching(false);
    setSearched(true);
    if (query.length === 0) {
      setHits([]);
      return;
    }
    setHits(
      knownCwds()
        .filter((path) => path.toLowerCase().includes(query))
        .slice(0, 20)
        .map((path) => ({ path, name: path.split('/').filter(Boolean).pop() ?? path })),
    );
  }, [search]);

  return (
    <Sheet onClose={closeSheet} title="选择工作空间" visible={open}>
      <Text style={{ color: colors.textMuted, fontSize: 12, paddingBottom: spacing.sm, paddingHorizontal: 3 }}>{copy.workspaceHintText}</Text>
      {demo ? (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs3 }}>
          <ContentCard items={workspaces.map((workspace) => ({ detail: workspace.path, icon: Folder, label: workspace.name, onPress: () => { chooseWorkspace(workspace.id, workspace.name, workspace.path); closeSheet(); }, selected: workspaceId === workspace.id }))} />
        </ScrollView>
      ) : (
        <View>
          <View style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, flexDirection: 'row', marginBottom: spacing.sm, paddingHorizontal: 12 }}>
            <TextInput
              accessibilityLabel="搜索项目目录"
              autoCapitalize="none"
              onChangeText={setSearch}
              onSubmitEditing={runSearch}
              placeholder="输入项目路径或关键词"
              placeholderTextColor={colors.textFaint}
              returnKeyType="search"
              style={{ color: colors.text, flex: 1, fontSize: 14, minHeight: 44, padding: 10 }}
              value={search}
            />
            {searching ? <ActivityIndicator color={colors.textFaint} /> : null}
          </View>
          <ContentCard
            items={[
              ...(search.trim().length > 0 ? [{ detail: '', icon: Folder, label: `${copy.use} ${search.trim()}`, onPress: () => { chooseWorkspace(search.trim(), search.trim().split('/').filter(Boolean).pop() ?? search.trim()); closeSheet(); } }] : []),
              ...hits.map((hit) => ({ detail: hit.path, icon: Folder, label: hit.name, onPress: () => { chooseWorkspace(hit.path, hit.name, hit.path); closeSheet(); }, selected: workspaceId === hit.path })),
            ]}
          />
          {searched && hits.length === 0 && !searching ? <Text style={{ color: colors.textFaint, fontSize: 12, paddingHorizontal: 3, paddingTop: spacing.sm }}>{copy.workspaceNoMatch}</Text> : null}
        </View>
      )}
    </Sheet>
  );
}
