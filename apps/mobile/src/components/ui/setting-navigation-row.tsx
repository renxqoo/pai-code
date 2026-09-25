import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type SettingNavigationRowProps = { label: string; detail: string; icon: LucideIcon; href: '/profile' | '/usage' | '/appearance' | '/preferences' };

export function SettingNavigationRow({ label, detail, icon: Icon, href }: SettingNavigationRowProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={() => { router.push(href); }} style={({ pressed }) => ({ alignItems: 'center', flexDirection: 'row', minHeight: 58, opacity: pressed ? 0.62 : 1, paddingHorizontal: spacing.xs3 })}><Icon color={colors.textMuted} size={20} strokeWidth={1.8} /><View style={{ flex: 1, marginLeft: spacing.xs2 }}><Text style={{ color: colors.text, fontSize: 15 }}>{label}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{detail}</Text></View><ChevronRight color={colors.textFaint} size={18} /></Pressable>;
}
