import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';

type ToggleRowProps = { label: string; detail: string; value: boolean; onChange: () => void };

export function ToggleRow({ label, detail, value, onChange }: ToggleRowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={onChange} style={({ pressed }) => ({ flexDirection: 'row', minHeight: 58, opacity: pressed ? 0.65 : 1, paddingHorizontal: spacing.xs3 })}>
      <View style={{ flex: 1, paddingVertical: 11 }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{detail}</Text>
      </View>
      <View style={{ backgroundColor: value ? colors.primary : colors.border, borderRadius: radius.pill, height: 30, justifyContent: 'center', marginTop: 14, paddingHorizontal: 3, width: 51 }}>
        <View style={{ alignSelf: value ? 'flex-end' : 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 12, height: 24, width: 24 }} />
      </View>
    </Pressable>
  );
}
