import * as React from 'react';
import { Text, View } from 'react-native';
import { MonitorCog } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function DeviceRow() {
  const { colors } = useAppTheme();
  return <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.xs3 }}><MonitorCog color={colors.textMuted} size={20} /><View style={{ flex: 1, marginLeft: spacing.xs2 }}><Text style={{ color: colors.text, fontSize: 15 }}>设备与连接</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>运行状态与连接设备</Text></View></View>;
}
