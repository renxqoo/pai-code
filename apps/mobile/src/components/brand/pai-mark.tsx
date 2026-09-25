import * as React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAppTheme } from '@/theme/theme-context';

type PaiMarkProps = { size?: number };

export function PaiMark({ size = 34 }: PaiMarkProps) {
  const { colors } = useAppTheme();
  return (
    <Svg accessibilityLabel="Pai Code" height={size} viewBox="0 0 40 40" width={size}>
      <Rect fill={colors.text} height="40" rx="11" width="40" x="0" y="0" />
      <Path d="M11 14.5L17.5 9H29v14.5L22.5 29H11V14.5Z" fill={colors.surface} stroke={colors.background} strokeWidth="1.5" />
      <Path d="M11 24V14.5L17.5 9h11.5" fill="none" stroke={colors.background} strokeLinecap="round" strokeWidth="2" />
      <Path d="M17 23v5M23 23v5" stroke={colors.background} strokeLinecap="round" strokeWidth="3" />
    </Svg>
  );
}
