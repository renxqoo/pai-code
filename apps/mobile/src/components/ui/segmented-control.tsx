import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type SegmentedOption<T extends string> = { value: T; label: string };
type SegmentedControlProps<T extends string> = { options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void };

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, flexDirection: 'row', padding: 3 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({ alignItems: 'center', backgroundColor: selected ? colors.surface : 'transparent', borderRadius: radius.sm, flex: 1, minHeight: 36, justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}
          >
            <Text numberOfLines={1} style={{ color: selected ? colors.text : colors.textMuted, fontSize: 13, fontWeight: selected ? '600' : '500' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
