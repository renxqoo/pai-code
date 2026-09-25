import * as React from 'react';
import { Pressable } from 'react-native';
import { Shield, ShieldCheck, ShieldQuestionMark } from 'lucide-react-native';
import type { PermissionMode } from '@/types/domain';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type PermissionButtonProps = { mode: PermissionMode; onPress: () => void };

export function PermissionButton({ mode, onPress }: PermissionButtonProps) {
  const { colors } = useAppTheme();
  const Icon = mode === 'auto' ? ShieldCheck : mode === 'plan' ? Shield : ShieldQuestionMark;
  const label = mode === 'auto' ? '自动批准' : mode === 'plan' ? '仅规划' : '每次询问';
  return (
    <Pressable
      accessibilityLabel={`权限模式：${label}`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', borderRadius: radius.md, height: 34, justifyContent: 'center', opacity: pressed ? 0.55 : 1, width: 34 })}
    >
      <Icon color={colors.textMuted} size={18} strokeWidth={1.9} />
    </Pressable>
  );
}
