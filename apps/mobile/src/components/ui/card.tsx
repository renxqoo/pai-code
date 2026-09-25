import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type CardProps = ViewProps;

export function Card({ style, ...props }: CardProps) {
  const { colors, isDark } = useAppTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: radius.xl },
        !isDark && { shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 3 },
        style,
      ]}
      {...props}
    />
  );
}
