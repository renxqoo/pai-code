import * as React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type EmptyStateProps = { icon: LucideIcon; title: string; description: string };

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs5, paddingVertical: spacing.xs8 }}>
      <View style={{ alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 68, justifyContent: 'center', width: 68 }}>
        <Icon color={colors.text} size={30} strokeWidth={1.65} />
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.35, marginTop: spacing.xs4, textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, maxWidth: 310, textAlign: 'center' }}>{description}</Text>
    </View>
  );
}
