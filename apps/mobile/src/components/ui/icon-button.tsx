import * as React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { layout, radius } from '@/theme/tokens';

type IconButtonProps = Omit<PressableProps, 'children'> & {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: number;
  filled?: boolean;
};

export function IconButton({ icon: Icon, label, active = false, size = 20, filled = false, disabled, ...props }: IconButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled ?? false, selected: active }}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        alignItems: 'center', backgroundColor: active ? colors.surfaceSubtle : 'transparent', borderRadius: radius.md,
        height: layout.minTouch, justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.58 : 1, width: layout.minTouch,
      })}
      {...props}
    >
      <Icon color={active ? colors.text : colors.textMuted} fill={filled ? colors.text : 'none'} size={size} strokeWidth={1.9} />
    </Pressable>
  );
}
