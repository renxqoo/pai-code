import * as React from 'react';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui/icon-button';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type PageHeaderProps = { title: string; subtitle?: string; action?: React.ReactNode };

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.xs2, paddingTop: insets.top }}>
      <IconButton icon={ArrowLeft} label="返回" onPress={() => router.back()} />
      <View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>{subtitle ? <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center' }}>{subtitle}</Text> : null}</View>
      <View style={{ minWidth: 44, paddingHorizontal: 4 }}>{action}</View>
    </View>
  );
}
