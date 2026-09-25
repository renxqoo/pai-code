import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { layout, radius, spacing } from '@/theme/tokens';

type ListRowProps = {
  label: string;
  detail?: string;
  icon?: LucideIcon;
  trailing?: string | undefined;
  onPress?: () => void;
  selected?: boolean;
  destructive?: boolean;
};

export function ListRow({ label, detail, icon: Icon, trailing, onPress, selected = false, destructive = false }: ListRowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', flexDirection: 'row', minHeight: 60, opacity: pressed ? 0.62 : 1, paddingHorizontal: spacing.xs4 })}
    >
      {Icon ? <Icon color={destructive ? colors.destructive : colors.text} size={21} strokeWidth={1.8} /> : null}
      <View style={{ flex: 1, marginLeft: Icon ? spacing.xs2 : 0 }}>
        <Text style={{ color: destructive ? colors.destructive : colors.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
        {detail ? <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{detail}</Text> : null}
      </View>
      {trailing ? <Text numberOfLines={1} style={{ color: selected ? colors.accent : colors.textMuted, fontSize: 13, marginLeft: spacing.sm, maxWidth: 140 }}>{trailing}</Text> : null}
      {onPress && !trailing ? <ChevronRight color={colors.textFaint} size={18} strokeWidth={1.7} /> : null}
      {onPress && trailing ? <View style={{ backgroundColor: selected ? colors.primary : 'transparent', borderRadius: radius.pill, height: 22, justifyContent: 'center', marginLeft: spacing.sm, width: 22 }}>{selected ? <Text style={{ color: colors.primaryText, fontSize: 15, textAlign: 'center' }}>✓</Text> : null}</View> : null}
      {!onPress && !trailing && !Icon ? <View style={{ height: layout.minTouch }} /> : null}
    </Pressable>
  );
}
