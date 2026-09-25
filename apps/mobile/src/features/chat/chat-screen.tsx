import * as React from 'react';
import { KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { ChatHeader } from '@/features/chat/chat-header';
import { EmptyChat } from '@/features/chat/empty-chat';
import { TimelineList } from '@/features/chat/timeline-list';
import { BottomConversationDock } from '@/features/chat/bottom-conversation-dock';
import { ExecutionTodoDock } from '@/features/chat/execution-todo-dock';
import { selectActiveExecution, withoutActiveExecution } from '@/features/chat/active-execution';
import { PermissionCard } from '@/features/chat/permission-card';
import { chatLayout, conversationBottomPadding } from '@/features/chat/chat-layout';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useComposerStore } from '@/store/composer-store';
import { demoSessions } from '@/fixtures/demo-data';

export function ChatScreen() {
  const scrollRef = React.useRef<ScrollView>(null);
  const nearBottomRef = React.useRef(true);
  const [todoExpanded, setTodoExpanded] = React.useState(true);
  const [composerFocused, setComposerFocused] = React.useState(false);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useConversationStore((state) => state.session);
  const openSheet = useNavigationStore((state) => state.openSheet);
  const setDraft = useComposerStore((state) => state.setDraft);
  const generating = useComposerStore((state) => state.generating);
  const openSession = useConversationStore((state) => state.openSession);
  const demoSession = demoSessions[0];
  const onDemo = () => {
    if (demoSession === undefined) return;
    openSession(demoSession);
    useConversationStore.getState().requestPermission({ id: 'demo-permission', title: '运行移动端检查', command: 'bun test --runInBand', approved: null });
  };
  const onContentSizeChange = () => {
    if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 72;
  };
  const activeExecution = selectActiveExecution(session.messages);
  const timelineMessages = withoutActiveExecution(session.messages);
  const bottomPadding = conversationBottomPadding(activeExecution !== null, todoExpanded, composerFocused);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View style={{ paddingTop: insets.top }}><ChatHeader /></View>
      <View style={{ flex: 1 }}>
        {session.messages.length === 0 ? <EmptyChat onDemo={onDemo} onPrompt={setDraft} onWorkspace={() => openSheet('workspace')} /> : <ScrollView ref={scrollRef} testID="conversation-scroll" contentContainerStyle={{ alignSelf: 'center', maxWidth: 760, paddingBottom: bottomPadding, paddingHorizontal: spacing.xs3, width: '100%' }} keyboardShouldPersistTaps="handled" onContentSizeChange={onContentSizeChange} onScroll={onScroll}><TimelineList generating={generating} messages={timelineMessages} /><PermissionCard /></ScrollView>}
      </View>
      <View style={{ bottom: insets.bottom, left: 0, pointerEvents: 'box-none', position: 'absolute', right: 0, zIndex: 10 }}>
        <View style={{ bottom: chatLayout.todoOffset, left: spacing.xs4, pointerEvents: 'box-none', position: 'absolute', right: spacing.xs4 }}>
          <ExecutionTodoDock execution={activeExecution} expanded={todoExpanded} onExpandedChange={setTodoExpanded} />
        </View>
        <BottomConversationDock onFocusChange={setComposerFocused} />
      </View>
    </KeyboardAvoidingView>
  );
}
