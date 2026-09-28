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
import { getBridge } from '@/mobile/bridge-runtime';

interface ProjectHit {
  path: string;
  name: string;
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

  const runSearch = React.useCallback(() => {
    const bridge = getBridge();
    const query = search.trim();
    if (bridge?.status !== 'ready' || query.length === 0) {
      setHits([]);
      setSearched(true);
      return;
    }
    setSearching(true);
    setSearched(true);
    void bridge.client
      .invoke('file/search', { cwd: query, query: '' })
      .then((outcome: unknown) => {
        const data = outcome as { ok: boolean; data?: unknown };
        if (!data.ok || !Array.isArray(data.data)) {
          setHits([]);
          return;
        }
        const paths = data.data as string[];
        setHits(paths.slice(0, 20).map((path) => ({ path, name: path.split('/').filter(Boolean).pop() ?? path })));
      })
      .finally(() => setSearching(false));
  }, [search]);

  const pickOnDesktop = (): void => {
    const bridge = getBridge();
    if (bridge?.status !== 'ready') return;
    void bridge.client.invoke('dialog/pickDirectory', {}).then((outcome: unknown) => {
      const data = outcome as { ok: boolean; data?: unknown };
      if (data.ok && typeof data.data === 'string' && data.data.length > 0) {
        const name = data.data.split('/').filter(Boolean).pop() ?? data.data;
        chooseWorkspace(data.data, name);
        closeSheet();
      }
    });
  };

  return (
    <Sheet onClose={closeSheet} title="选择工作空间" visible={open}>
      <Text style={{ color: colors.textMuted, fontSize: 12, paddingBottom: spacing.sm, paddingHorizontal: 3 }}>选择 Pai Code 可以访问的代码目录</Text>
      {demo ? (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xs3 }}>
          <ContentCard items={workspaces.map((workspace) => ({ detail: workspace.path, icon: Folder, label: workspace.name, onPress: () => { chooseWorkspace(workspace.id, workspace.name); closeSheet(); }, selected: workspaceId === workspace.id }))} />
        </ScrollView>
      ) : (
        <View>
          <View style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, flexDirection: 'row', marginBottom: spacing.sm, paddingHorizontal: 12 }}>
            <TextInput
              accessibilityLabel="搜索项目目录"
              autoCapitalize="none"
              onChangeText={setSearch}
              onSubmitEditing={runSearch}
              placeholder="输入项目路径（如 ~/work）"
              placeholderTextColor={colors.textFaint}
              returnKeyType="search"
              style={{ color: colors.text, flex: 1, fontSize: 14, minHeight: 44, padding: 10 }}
              value={search}
            />
            {searching ? <ActivityIndicator color={colors.textFaint} /> : null}
          </View>
          <ContentCard
            items={[
              { detail: '在电脑上打开目录选择器', icon: Folder, label: '浏览电脑目录', onPress: pickOnDesktop },
              ...(search.trim().length > 0 ? [{ detail: '', icon: Folder, label: `使用 ${search.trim()}`, onPress: () => { chooseWorkspace(search.trim(), search.trim().split('/').filter(Boolean).pop() ?? search.trim()); closeSheet(); } }] : []),
              ...hits.map((hit) => ({ detail: hit.path, icon: Folder, label: hit.name, onPress: () => { chooseWorkspace(hit.path, hit.name); closeSheet(); }, selected: workspaceId === hit.path })),
            ]}
          />
          {searched && hits.length === 0 && !searching ? <Text style={{ color: colors.textFaint, fontSize: 12, paddingHorizontal: 3, paddingTop: spacing.sm }}>没有匹配的目录——试试「浏览电脑目录」或完整路径。</Text> : null}
        </View>
      )}
    </Sheet>
  );
}
