import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Folder } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { ContentCard } from '@/components/ui/content-card';
import { SectionHeader } from '@/components/ui/section-header';
import { workspaces } from '@/fixtures/demo-data';
import { useConversationStore } from '@/store/conversation-store';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function ProjectsRoute() {
  const { colors } = useAppTheme();
  const selected = useConversationStore((state) => state.workspaceId);
  const choose = useConversationStore((state) => state.chooseWorkspace);
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="项目" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><SectionHeader title="工作空间" /><ContentCard items={workspaces.map((item) => ({ detail: item.path, icon: Folder, label: item.name, onPress: () => choose(item.id, item.name), selected: selected === item.id }))} /><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs3 }}>项目用于组织对话、文件与本地权限。切换项目不会删除已有历史。</Text></ScrollView></View>;
}
