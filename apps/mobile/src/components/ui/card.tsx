import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type CardProps = ViewProps & { elevated?: boolean };

export function Card({ elevated = false, style, ...props }: CardProps) {
  const { colors, isDark } = useAppTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1 },
        elevated && !isDark && { shadowColor: '#1C1B1A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 4 },
        style,
      ]}
      {...props}
    />
  );
}
