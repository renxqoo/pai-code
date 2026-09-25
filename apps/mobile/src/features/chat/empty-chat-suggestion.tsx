import * as React from 'react';
import { Pressable, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type EmptyChatSuggestionProps = { icon: LucideIcon; label: string; onPress: () => void };

export function EmptyChatSuggestion({ icon: Icon, label, onPress }: EmptyChatSuggestionProps) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, flexDirection: 'row', gap: 7, minHeight: 38, opacity: pressed ? 0.6 : 1, paddingHorizontal: 12 })}><Icon color={colors.textMuted} size={15} /><Text style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}>{label}</Text></Pressable>;
}
