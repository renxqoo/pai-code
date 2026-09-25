import * as React from 'react';
import { Pressable, Text, type PressableProps, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium' | 'large';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: TextStyle;
  containerStyle?: ViewStyle;
};

export function Button({ label, variant = 'primary', size = 'medium', disabled, style, containerStyle, ...props }: ButtonProps) {
  const { colors } = useAppTheme();
  const palette = {
    primary: { background: colors.primary, color: colors.primaryText },
    secondary: { background: colors.surfaceSubtle, color: colors.text },
    ghost: { background: 'transparent', color: colors.text },
    danger: { background: colors.destructive, color: '#FFFFFF' },
  }[variant];
  const dimensions = {
    small: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 13 },
    medium: { paddingVertical: 11, paddingHorizontal: 16, fontSize: 14 },
    large: { paddingVertical: 14, paddingHorizontal: 20, fontSize: 15 },
  }[size];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [containerStyle, { opacity: disabled ? 0.45 : pressed ? 0.72 : 1 }]}
      {...props}
    >
      <Text style={[{ backgroundColor: palette.background, color: palette.color, borderRadius: radius.md, fontWeight: '600', textAlign: 'center', ...dimensions }, style]}>
        {label}
      </Text>
    </Pressable>
  );
}
