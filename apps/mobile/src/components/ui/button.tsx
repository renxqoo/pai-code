import * as React from 'react';
import { Pressable, Text, type PressableProps, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { layout, radius, type } from '@/theme/tokens';

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
  // 触控基线 44pt（T51）：文本容器自带 minHeight，与 padding 无关地命中达标。
  const dimensions = {
    small: { fontSize: type.row.fontSize, minHeight: layout.minTouch, paddingHorizontal: 12, paddingVertical: 8 },
    medium: { fontSize: type.body.fontSize, minHeight: layout.minTouch, paddingHorizontal: 16, paddingVertical: 11 },
    large: { fontSize: type.body.fontSize, minHeight: 52, paddingHorizontal: 20, paddingVertical: 14 },
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
