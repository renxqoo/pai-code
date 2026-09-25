import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import { ChatHeader } from '@/features/chat/chat-header';
import { EmptyChat } from '@/features/chat/empty-chat';
import { MessageRow } from '@/features/chat/message-row';
import { PermissionCard } from '@/features/chat/permission-card';
import { ComposerPanel } from '@/features/composer/composer-panel';
import { useConversationStore } from '@/store/conversation-store';
import { useNavigationStore } from '@/store/navigation-store';

export function ChatScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useConversationStore((state) => state.session);
  const openSheet = useNavigationStore((state) => state.openSheet);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View style={{ paddingTop: insets.top }}><ChatHeader /></View>
      {session.messages.length === 0 ? <EmptyChat onWorkspace={() => openSheet('workspace')} /> : <ScrollView contentContainerStyle={{ maxWidth: 760, paddingBottom: spacing.xs5, paddingHorizontal: spacing.xs3, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">{session.messages.map((message) => <MessageRow key={message.id} message={message} />)}<PermissionCard /></ScrollView>}
      <View style={{ paddingBottom: insets.bottom }}><ComposerPanel /></View>
    </KeyboardAvoidingView>
  );
}
