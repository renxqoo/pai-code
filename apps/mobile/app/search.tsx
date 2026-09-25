import * as React from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { PageHeader } from '@/components/navigation/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SessionRow } from '@/features/history/session-row';
import { SessionSheet } from '@/features/history/session-sheet';
import { useHistoryStore } from '@/store/history-store';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export default function SearchRoute() {
  const { colors } = useAppTheme();
  const sessions = useHistoryStore((state) => state.sessions);
  const query = useHistoryStore((state) => state.query);
  const setQuery = useHistoryStore((state) => state.setQuery);
  const open = useConversationStore((state) => state.openSession);
  const openSheet = useNavigationStore((state) => state.openSheet);
  const results = sessions.filter((item) => !item.archived && `${item.title}${item.preview}${item.project}`.toLowerCase().includes(query.toLowerCase()));
  return <><View style={{ backgroundColor: colors.background, flex: 1 }}><PageHeader title="搜索" /><View style={{ marginHorizontal: spacing.xs3 }}><View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 12, flexDirection: 'row' }}><Search color={colors.textFaint} size={18} /><TextInput autoFocus accessibilityLabel="搜索对话" onChangeText={setQuery} placeholder="搜索标题、内容或项目" placeholderTextColor={colors.textFaint} style={{ color: colors.text, flex: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 10 }} value={query} /></View></View><ScrollView contentContainerStyle={{ padding: spacing.xs3 }}>{results.length === 0 ? <EmptyState description="试试项目名、文件名或对话关键词。" icon={Search} title="没有找到对话" /> : results.map((item) => <SessionRow key={item.id} onAction={() => { open(item); openSheet('session-actions'); }} onOpen={() => open(item)} session={item} />)}</ScrollView></View><SessionSheet /></>;
}
