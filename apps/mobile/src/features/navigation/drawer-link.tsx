import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';

type DrawerLinkProps = { icon: LucideIcon; label: string; detail?: string; onPress: () => void };

export function DrawerLink({ icon: Icon, label, detail, onPress }: DrawerLinkProps) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', minHeight: 50, opacity: pressed ? 0.62 : 1, paddingHorizontal: spacing.sm })}><Icon color={colors.textMuted} size={20} strokeWidth={1.8} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>{detail ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{detail}</Text> : null}</View></Pressable>;
}
