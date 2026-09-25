import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Folder, Plus } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { Card } from '@/components/ui/card';
import { ListRow } from '@/components/ui/list-row';
import { SectionHeader } from '@/components/ui/section-header';
import { workspaces } from '@/fixtures/demo-data';
import { useConversationStore } from '@/store/conversation-store';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function ProjectsRoute() {
  const { colors } = useAppTheme();
  const workspaceId = useConversationStore((state) => state.workspaceId);
  const chooseWorkspace = useConversationStore((state) => state.chooseWorkspace);
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader action={<ListRow detail="" icon={Plus} label="添加" />} title="项目" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}><SectionHeader title="工作空间" /><Card style={{ marginTop: spacing.xs2 }}>{workspaces.map((workspace) => <ListRow detail={workspace.path} icon={Folder} key={workspace.id} label={workspace.name} onPress={() => chooseWorkspace(workspace.id, workspace.name)} selected={workspaceId === workspace.id} />)}</Card><Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs3 }}>项目用于组织对话、文件与本地权限。切换项目不会删除已有历史。</Text></ScrollView></View>;
}
