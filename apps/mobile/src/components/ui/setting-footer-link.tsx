import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';

type SettingFooterLinkProps = { label: string; detail: string; icon: LucideIcon; href: '/help' | '/about' | '/privacy' };

export function SettingFooterLink({ label, detail, icon: Icon, href }: SettingFooterLinkProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={() => { router.push(href); }} style={({ pressed }) => ({ alignItems: 'center', flexDirection: 'row', minHeight: 58, opacity: pressed ? 0.62 : 1, paddingHorizontal: 12 })}><Icon color={colors.textMuted} size={20} strokeWidth={1.8} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 15 }}>{label}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{detail}</Text></View><ChevronRight color={colors.textFaint} size={18} /></Pressable>;
}
