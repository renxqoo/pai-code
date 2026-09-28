import * as React from 'react';
import { Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing, type } from '@/theme/tokens';
import { Button } from '@/components/ui/button';
import { monospaceFont } from '@/components/monospace-font';
import { useConversationStore } from '@/store/conversation-store';
import { getBridge } from '@/mobile/bridge-runtime';

export function PermissionCard() {
  const { colors } = useAppTheme();
  const request = useConversationStore((state) => state.permissionRequest);
  const resolve = useConversationStore((state) => state.resolvePermission);
  const clearPermission = useConversationStore((state) => state.clearPermission);
  // 应答：dialog/respond（受理即清卡——裁决结果经事件流对账，PC 端同语义）
  const respond = (approved: boolean) => {
    resolve(approved);
    const bridge = getBridge();
    if (bridge?.status === 'ready') {
      void bridge.client.invoke('dialog/respond', { requestId: request?.id ?? '', payload: { confirmed: approved } });
    }
    clearPermission();
  };
  if (request === null) return null;
  return (
    <View accessibilityLabel="权限确认" style={{ backgroundColor: colors.accentSoft, borderRadius: radius.lg, marginTop: spacing.sm, padding: spacing.xs3 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row' }}>
        <ShieldCheck color={colors.accent} size={19} />
        <Text style={{ color: colors.text, fontSize: type.title.fontSize, fontWeight: '700', marginLeft: spacing.sm }}>{request.title}</Text>
      </View>
      <Text selectable style={{ color: colors.textMuted, fontFamily: monospaceFont, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight, marginTop: spacing.sm }}>{request.command}</Text>
      {request.approved === null ? <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs3 }}><Button containerStyle={{ flex: 1 }} label="拒绝" onPress={() => respond(false)} size="small" variant="secondary" /><Button containerStyle={{ flex: 1 }} label="允许一次" onPress={() => respond(true)} size="small" /></View> : <Text style={{ color: request.approved ? colors.success : colors.destructive, fontSize: type.row.fontSize, marginTop: spacing.sm }}>{request.approved ? '已允许' : '已拒绝'}</Text>}
    </View>
  );
}
