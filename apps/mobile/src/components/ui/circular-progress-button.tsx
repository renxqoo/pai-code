import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '@/theme/theme-context';

type CircularProgressButtonProps = { value: number; onPress: () => void; accessibilityLabel: string };

const size = 20;
const stroke = 3;
const center = size / 2;
const radiusValue = (size - stroke) / 2;
const circumference = 2 * Math.PI * radiusValue;

export function CircularProgressButton({ value, onPress, accessibilityLabel }: CircularProgressButtonProps) {
  const { colors } = useAppTheme();
  const progress = Math.max(0, Math.min(100, value));
  const color = progress >= 90 ? colors.destructive : colors.text;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityValue={{ min: 0, max: 100, now: progress }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', height: 34, justifyContent: 'center', opacity: pressed ? 0.58 : 1, width: 34 })}
    >
      <View style={{ alignItems: 'center', height: size, justifyContent: 'center', position: 'absolute', width: size }}>
        <Text style={{ color, fontSize: 5, fontWeight: '700' }}>{Math.round(progress)}</Text>
      </View>
      <Svg height={size} width={size}>
        <Circle cx={center} cy={center} fill="none" r={radiusValue} stroke={colors.border} strokeWidth={stroke} />
        <Circle
          cx={center}
          cy={center}
          fill="none"
          r={radiusValue}
          stroke={color}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress / 100)}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
    </Pressable>
  );
}
