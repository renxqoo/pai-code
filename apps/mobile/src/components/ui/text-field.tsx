import * as React from 'react';
import { TextInput, type TextInputProps, View, Text } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';

type TextFieldProps = TextInputProps & { label?: string };

export function TextField({ label, style, multiline, ...props }: TextFieldProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        multiline={multiline}
        placeholderTextColor={colors.textFaint}
        style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: multiline ? 104 : 46, paddingHorizontal: 13, paddingVertical: multiline ? 12 : 10, textAlignVertical: multiline ? 'top' : 'center' }, style]}
        {...props}
      />
    </View>
  );
}
