import * as React from 'react';
import { Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { Button } from '@/components/ui/button';
import { monospaceFont } from '@/components/monospace-font';
import { useConversationStore } from '@/store/conversation-store';

export function PermissionCard() {
  const { colors } = useAppTheme();
  const request = useConversationStore((state) => state.permissionRequest);
  const resolve = useConversationStore((state) => state.resolvePermission);
  if (request === null) return null;
  return (
    <View accessibilityLabel="权限确认" style={{ backgroundColor: colors.accentSoft, borderRadius: radius.lg, marginTop: spacing.sm, padding: spacing.xs3 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row' }}>
        <ShieldCheck color={colors.accent} size={19} />
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginLeft: spacing.sm }}>{request.title}</Text>
      </View>
      <Text selectable style={{ color: colors.textMuted, fontFamily: monospaceFont, fontSize: 12, lineHeight: 18, marginTop: spacing.sm }}>{request.command}</Text>
      {request.approved === null ? <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs3 }}><Button containerStyle={{ flex: 1 }} label="拒绝" onPress={() => resolve(false)} size="small" variant="secondary" /><Button containerStyle={{ flex: 1 }} label="允许一次" onPress={() => resolve(true)} size="small" /></View> : <Text style={{ color: request.approved ? colors.success : colors.destructive, fontSize: 13, marginTop: spacing.sm }}>{request.approved ? '已允许' : '已拒绝'}</Text>}
    </View>
  );
}
