import * as React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { ComposerPanel } from '@/features/composer/composer-panel';

type BottomConversationDockProps = { onFocusChange?: (focused: boolean) => void };

export function BottomConversationDock({ onFocusChange }: BottomConversationDockProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.xs3, marginHorizontal: spacing.xs4, padding: 4, shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 }}>
      <ComposerPanel embedded onFocusChange={onFocusChange} />
    </View>
  );
}
