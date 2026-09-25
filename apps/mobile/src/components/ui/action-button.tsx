import * as React from 'react';
import { Pressable, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';

type ActionButtonProps = { icon: LucideIcon; label: string; destructive?: boolean; onPress: () => void };

export function ActionButton({ icon: Icon, label, destructive = false, onPress }: ActionButtonProps) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ alignItems: 'center', flexDirection: 'row', minHeight: 44 }}><Icon color={destructive ? colors.destructive : colors.text} size={18} /><Text style={{ color: destructive ? colors.destructive : colors.text, fontSize: 14, marginLeft: 10 }}>{label}</Text></Pressable>;
}
