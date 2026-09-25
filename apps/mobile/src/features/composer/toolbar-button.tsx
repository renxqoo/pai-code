import * as React from 'react';
import { Pressable, Text } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import type { Plus } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type ToolbarButtonProps = { label?: string; icon?: typeof Plus; text?: boolean; onPress: () => void };

export function ToolbarButton({ label, icon: Icon, text = false, onPress }: ToolbarButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: text ? colors.surfaceSubtle : 'transparent', borderRadius: radius.pill, flexDirection: 'row', gap: 3, marginRight: text ? 5 : 0, minHeight: 34, opacity: pressed ? 0.58 : 1, paddingHorizontal: text ? 8 : 5 })}>
      {Icon ? <Icon color={colors.textMuted} size={19} /> : null}
      {text && label ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, fontWeight: '500' }}>{label}</Text> : null}
      {text && label ? <ChevronDown color={colors.textFaint} size={12} /> : null}
    </Pressable>
  );
}
