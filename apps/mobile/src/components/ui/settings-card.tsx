import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export type SettingsItem = {
  label: string;
  detail: string;
  icon: LucideIcon;
  href: '/profile' | '/usage' | '/preferences' | '/appearance' | '/devices' | '/privacy' | '/help' | '/about';
};

type SettingsCardProps = { items: readonly SettingsItem[] };

export function SettingsCard({ items }: SettingsCardProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden', shadowColor: '#3F3F46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 3 }}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <React.Fragment key={item.href}>
            {index > 0 ? <View style={{ backgroundColor: colors.divider, height: 1, marginLeft: 64 }} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.label}，${item.detail}`}
              onPress={() => { router.push(item.href); }}
              style={({ pressed }) => ({ alignItems: 'center', flexDirection: 'row', minHeight: 64, opacity: pressed ? 0.58 : 1, paddingHorizontal: spacing.xs4 })}
            >
              <View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }}><Icon color={colors.text} size={18} strokeWidth={1.8} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '500' }}>{item.label}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{item.detail}</Text></View>
              <ChevronRight color={colors.textFaint} size={18} strokeWidth={1.7} />
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}
