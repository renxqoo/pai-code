import * as React from 'react';
import { KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm, spacing } from '@/theme/tokens';
import { ChatHeader } from '@/features/chat/chat-header';
import { EmptyChat } from '@/features/chat/empty-chat';
import { TimelineList } from '@/features/chat/timeline-list';
import { BottomConversationDock } from '@/features/chat/bottom-conversation-dock';
import { PermissionCard } from '@/features/chat/permission-card';
import { useSessionElapsed } from '@/features/chat/use-session-elapsed';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useComposerStore } from '@/store/composer-store';
import { agentConversation } from '@/fixtures/agent-conversation';
import { useDemoModeStore } from '@/store/demo-mode-store';

export function ChatScreen() {
  const scrollRef = React.useRef<ScrollView>(null);
  const nearBottomRef = React.useRef(true);
  const [dockHeight, setDockHeight] = React.useState(0);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useConversationStore((state) => state.session);
  const openSheet = useNavigationStore((state) => state.openSheet);
  const setDraft = useComposerStore((state) => state.setDraft);
  const generating = useComposerStore((state) => state.generating);
  const openSession = useConversationStore((state) => state.openSession);
  const demoEnabled = useDemoModeStore((state) => state.enabled);
  const onDemo = () => {
    openSession(agentConversation);
    useConversationStore.getState().requestPermission({ id: 'demo-permission', title: '运行移动端检查', command: 'bun test --runInBand', approved: null });
  };
  
  const onContentSizeChange = () => {
    if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 72;
  };
  // 底部避让 = iOS 安全区 + 实测输入区高度 + 一个轮间距的呼吸：输入区聚焦长高、
  // 加附件、换机型都自动适配——消息流末端与执行中指示绝不被输入框遮盖。
  const bottomPadding = insets.bottom + dockHeight + rhythm.turnGap;
  const elapsedMs = useSessionElapsed(session);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View style={{ paddingTop: insets.top }}><ChatHeader /></View>
      <View style={{ flex: 1 }}>
        {session.messages.length === 0 ? <EmptyChat onDemo={demoEnabled ? onDemo : () => {}} onPrompt={setDraft} onWorkspace={() => openSheet('workspace')} /> : <ScrollView ref={scrollRef} testID="conversation-scroll" contentContainerStyle={{ alignSelf: 'center', maxWidth: 760, paddingBottom: bottomPadding, paddingHorizontal: spacing.xs3, width: '100%' }} keyboardShouldPersistTaps="handled" onContentSizeChange={onContentSizeChange} onScroll={onScroll} scrollEventThrottle={16}><TimelineList elapsedMs={elapsedMs} generating={generating} messages={session.messages} /><PermissionCard /></ScrollView>}
      </View>
      <View
        onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
        style={{ bottom: insets.bottom, left: 0, pointerEvents: 'box-none', position: 'absolute', right: 0, zIndex: 10 }}
        testID="conversation-dock"
      >
        <BottomConversationDock />
      </View>
    </KeyboardAvoidingView>
  );
}
