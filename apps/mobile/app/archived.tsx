import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useHistoryStore } from '@/store/history-store';
import { useConversationStore } from '@/store/conversation-store';
import { useAppTheme } from '@/theme/theme-context';
import { Archive } from 'lucide-react-native';
import { spacing } from '@/theme/tokens';

export default function ArchivedRoute() {
  const { colors } = useAppTheme();
  const sessions = useHistoryStore((state) => state.sessions).filter((item) => item.archived);
  const open = useConversationStore((state) => state.openSession);
  return <View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="归档对话" /><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}>{sessions.length === 0 ? <EmptyState description="需要暂存的对话会出现在这里。" icon={Archive} title="没有归档对话" /> : sessions.map((item) => <Text key={item.id} onPress={() => open(item)} style={{ color: colors.text, fontSize: 15, paddingVertical: 14 }}>{item.title}</Text>)}</ScrollView></View>;
}
