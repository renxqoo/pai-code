import * as React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { ComposerAttachmentButton } from '@/features/composer/composer-attachment-button';
import { ComposerInput } from '@/features/composer/composer-input';
import { SendButton } from '@/features/composer/send-button';

type CompactComposerProps = { draft: string; canSend: boolean; embedded: boolean; generating: boolean; onChangeText: (value: string) => void; onFocus: () => void; onAttachment: () => void; onSend: () => void };

export function CompactComposer({ draft, canSend, embedded, generating, onChangeText, onFocus, onAttachment, onSend }: CompactComposerProps) {
  const { colors } = useAppTheme();
  return (
    <View testID="compact-composer" style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: embedded ? 0 : radius.pill, flexDirection: 'row', minHeight: 58, paddingHorizontal: embedded ? 0 : spacing.xs, paddingVertical: embedded ? 0 : 6, ...(embedded ? {} : { shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 }) }}>
      <ComposerAttachmentButton onPress={onAttachment} />
      <ComposerInput focused={false} onChangeText={onChangeText} onFocus={onFocus} value={draft} />
      <SendButton canSend={canSend} generating={generating} onPress={onSend} />
    </View>
  );
}
