import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';
import type { ContentItem } from '@/components/ui/content-item';

export function ContentRow({ label, detail, icon: Icon, trailing, selected = false, onPress }: ContentItem) {
  const { colors } = useAppTheme();
  const content = <><View style={{ alignItems: 'center', backgroundColor: selected ? colors.primary : colors.surfaceSubtle, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }}>{Icon ? <Icon color={selected ? colors.primaryText : colors.text} size={18} strokeWidth={1.8} /> : <View style={{ backgroundColor: colors.textFaint, borderRadius: 5, height: 5, width: 5 }} />}</View><View style={{ flex: 1, marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{label}</Text>{detail ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{detail}</Text> : null}</View>{selected ? <Check color={colors.text} size={19} /> : null}{trailing && !selected ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8, maxWidth: 120 }}>{trailing}</Text> : null}{onPress ? <ChevronRight color={colors.textFaint} size={18} /> : null}</>;
  const style = { alignItems: 'center' as const, flexDirection: 'row' as const, minHeight: 64, paddingHorizontal: spacing.xs4 };
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}${detail === undefined ? '' : `，${detail}`}`} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.58 : 1 }]}>{content}</Pressable> : <View style={style}>{content}</View>;
}
