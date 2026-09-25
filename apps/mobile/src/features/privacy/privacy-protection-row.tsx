import * as React from 'react';
import { Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function PrivacyProtectionRow() {
  const { colors } = useAppTheme();
  return <View accessibilityLabel="隐私保护已启用" style={{ alignItems: 'center', flexDirection: 'row', minHeight: 64, paddingHorizontal: spacing.xs3 }}><View style={{ alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }}><ShieldCheck color={colors.success} size={19} /></View><View style={{ flex: 1, marginLeft: 12 }}><Text style={{ color: colors.text, fontSize: 15 }}>隐私保护</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>反馈默认不包含代码、文件内容或凭据</Text></View></View>;
}
