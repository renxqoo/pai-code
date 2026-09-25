import * as React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { ComposerAttachmentButton } from '@/features/composer/composer-attachment-button';
import { ComposerInput } from '@/features/composer/composer-input';
import { SendButton } from '@/features/composer/send-button';

type FocusedComposerProps = { draft: string; canSend: boolean; generating: boolean; onChangeText: (value: string) => void; onBlur: () => void; onAttachment: () => void; onSend: () => void };

export function FocusedComposer({ draft, canSend, generating, onChangeText, onBlur, onAttachment, onSend }: FocusedComposerProps) {
  const { colors } = useAppTheme();
  return (
    <View testID="focused-composer" style={{ backgroundColor: colors.surface, borderRadius: radius.xl, minHeight: 132, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 }}>
      <ComposerInput focused onBlur={onBlur} onChangeText={onChangeText} value={draft} />
      <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 44, paddingHorizontal: 2 }}><ComposerAttachmentButton onPress={onAttachment} /><View style={{ flex: 1 }} /><SendButton canSend={canSend} generating={generating} onPress={onSend} /></View>
    </View>
  );
}
