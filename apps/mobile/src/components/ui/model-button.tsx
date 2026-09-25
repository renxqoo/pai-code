import * as React from 'react';
import { Pressable } from 'react-native';
import { Cpu } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type ModelButtonProps = { onPress: () => void };

export function ModelButton({ onPress }: ModelButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel="模型与思考"
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', borderRadius: radius.md, height: 34, justifyContent: 'center', opacity: pressed ? 0.55 : 1, width: 34 })}
    >
      <Cpu color={colors.textMuted} size={18} strokeWidth={1.9} />
    </Pressable>
  );
}
