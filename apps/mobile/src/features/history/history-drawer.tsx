import * as React from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Settings, SquarePen, X } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { IconButton } from '@/components/ui/icon-button';
import { SectionHeader } from '@/components/ui/section-header';
import { PaiMark } from '@/components/brand/pai-mark';
import { SessionRow } from '@/features/history/session-row';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useNavigationStore } from '@/store/navigation-store';

export function HistoryDrawer() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const open = useNavigationStore((state) => state.drawerOpen);
  const setDrawerOpen = useNavigationStore((state) => state.setDrawerOpen);
  const openSheet = useNavigationStore((state) => state.openSheet);
  const sessions = useHistoryStore((state) => state.sessions);
  const query = useHistoryStore((state) => state.query);
  const setQuery = useHistoryStore((state) => state.setQuery);
  const selectSession = useHistoryStore((state) => state.selectSession);
  const openSession = useConversationStore((state) => state.openSession);
  const startNewSession = useConversationStore((state) => state.startNewSession);
  const visible = sessions.filter((session) => !session.pinned && (query.length === 0 || `${session.title}${session.preview}${session.project}`.includes(query)) && (!session.archived || query.length > 0));
  return (
    <Modal animationType="fade" onRequestClose={() => setDrawerOpen(false)} transparent visible={open}>
      <View style={{ backgroundColor: colors.overlay, flex: 1 }}><Pressable accessibilityLabel="关闭对话历史" onPress={() => setDrawerOpen(false)} style={{ flex: 1 }} /><View accessibilityLabel="对话历史" style={{ backgroundColor: colors.surface, bottom: 0, left: 0, paddingTop: insets.top, position: 'absolute', top: 0, width: '87%' }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.xs3 }}><PaiMark size={30} /><Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginLeft: 9 }}>Pai Code</Text><IconButton icon={X} label="关闭" onPress={() => setDrawerOpen(false)} style={{ marginLeft: 'auto' }} /></View>
        <View style={{ paddingHorizontal: spacing.xs3 }}><Pressable accessibilityRole="button" onPress={() => { startNewSession(); setDrawerOpen(false); }} style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, flexDirection: 'row', minHeight: 46, paddingHorizontal: 14 }}><SquarePen color={colors.primaryText} size={18} /><Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '600', marginLeft: 9 }}>新建对话</Text></Pressable>
          <View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, flexDirection: 'row', marginTop: spacing.sm, minHeight: 42, paddingHorizontal: 11 }}><Search color={colors.textFaint} size={17} /><TextInput accessibilityLabel="搜索对话" onChangeText={setQuery} placeholder="搜索对话和项目" placeholderTextColor={colors.textFaint} style={{ color: colors.text, flex: 1, fontSize: 14, padding: 10 }} value={query} /></View>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xs5, paddingHorizontal: spacing.xs3 }}>{sessions.filter((session) => session.pinned).length > 0 ? <><SectionHeader title="置顶" />{sessions.filter((session) => session.pinned).map((session) => <SessionRow key={session.id} onAction={() => { selectSession(session.id); openSession(session); openSheet('session-actions'); }} onOpen={() => { selectSession(session.id); openSession(session); setDrawerOpen(false); }} session={session} />)}</> : null}
          <SectionHeader action="+ 添加项目" onAction={() => { router.push('/settings'); setDrawerOpen(false); }} title="项目" />
          {visible.map((session) => <SessionRow key={session.id} onAction={() => { selectSession(session.id); openSession(session); openSheet('session-actions'); }} onOpen={() => { selectSession(session.id); openSession(session); setDrawerOpen(false); }} session={session} />)}
        </ScrollView>
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, padding: spacing.xs3 }}><Pressable accessibilityRole="button" onPress={() => { router.push('/settings'); setDrawerOpen(false); }} style={{ alignItems: 'center', flexDirection: 'row', minHeight: 46 }}><Settings color={colors.text} size={19} /><Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginLeft: 11 }}>个人设置</Text></Pressable></View>
      </View></View>
    </Modal>
  );
}
