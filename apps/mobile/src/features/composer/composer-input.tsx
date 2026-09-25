import * as React from 'react';
import { TextInput } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type ComposerInputProps = { focused: boolean; value: string; onChangeText: (value: string) => void; onFocus?: () => void; onBlur?: () => void };

export function ComposerInput({ focused, value, onChangeText, onFocus, onBlur }: ComposerInputProps) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      accessibilityLabel="消息输入框"
      blurOnSubmit={!focused}
      multiline
      onBlur={onBlur}
      onChangeText={onChangeText}
      onFocus={onFocus}
      placeholder="尽管问，带图也行"
      placeholderTextColor={colors.textFaint}
      style={{ color: colors.text, flex: 1, fontSize: 16, lineHeight: 22, maxHeight: focused ? 88 : 44, minHeight: focused ? 64 : 44, paddingHorizontal: focused ? spacing.xs : 4, paddingVertical: focused ? spacing.sm : 10, textAlignVertical: focused ? 'top' : 'center' }}
      value={value}
    />
  );
}
