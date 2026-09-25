import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type AttachmentOptionProps = { icon: LucideIcon; label: string; description: string; onPress: () => void };

export function AttachmentOption({ icon: Icon, label, description, onPress }: AttachmentOptionProps) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, flexDirection: 'row', minHeight: 62, padding: 13 }}><View style={{ alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, height: 38, justifyContent: 'center', width: 38 }}><Icon color={colors.text} size={19} /></View><View style={{ marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{description}</Text></View></Pressable>;
}
