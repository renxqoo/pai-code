import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, MonitorCog } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

export function DeviceRow() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={() => { router.push('/devices'); }} style={({ pressed }) => ({ alignItems: 'center', flexDirection: 'row', minHeight: 58, opacity: pressed ? 0.62 : 1, paddingHorizontal: spacing.xs3 })}><MonitorCog color={colors.textMuted} size={20} /><View style={{ flex: 1, marginLeft: spacing.xs2 }}><Text style={{ color: colors.text, fontSize: 15 }}>设备与连接</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>运行状态与连接设备</Text></View><ChevronRight color={colors.textFaint} size={18} /></Pressable>;
}
