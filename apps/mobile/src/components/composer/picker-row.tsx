import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type PickerRowProps = { label: string; detail: string; meta?: string; selected: boolean; onPress: () => void };

export function PickerRow({ label, detail, meta, selected, onPress }: PickerRowProps) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={{ backgroundColor: selected ? colors.surfaceSubtle : 'transparent', borderRadius: radius.md, flexDirection: 'row', marginTop: 4, padding: 12 }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{label}</Text>{meta ? <Text style={{ color: colors.accent, fontSize: 11, marginTop: 3 }}>{meta}</Text> : null}<Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 }}>{detail}</Text></View>{selected ? <Check color={colors.text} size={20} /> : null}</Pressable>;
}
