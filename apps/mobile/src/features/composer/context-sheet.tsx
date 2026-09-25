import * as React from 'react';
import { Text, View } from 'react-native';
import { Gauge } from 'lucide-react-native';
import { Sheet } from '@/components/ui/sheet';
import { useComposerStore } from '@/store/composer-store';
import { useNavigationStore } from '@/store/navigation-store';
import { useAppTheme } from '@/theme/theme-context';
import { radius, spacing } from '@/theme/tokens';
import { contextBarIsDanger } from '@/features/composer/context-bar-color';

export function ContextSheet() {
  const { colors } = useAppTheme();
  const visible = useNavigationStore((state) => state.sheet === 'context');
  const close = useNavigationStore((state) => state.closeSheet);
  const percent = useComposerStore((state) => state.contextPercent);
  return (
    <Sheet onClose={close} title="上下文用量" visible={visible}>
      <View style={{ paddingBottom: spacing.xs5, paddingHorizontal: spacing.xs }}>
        <View style={{ alignItems: 'center', flexDirection: 'row' }}><Gauge color={colors.textMuted} size={18} /><Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginLeft: 8 }}>{percent}%</Text></View>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.sm }}>上下文包含消息、附件内容与任务状态。接近上限时，建议新建对话或压缩历史。</Text>
        <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, height: 10, marginTop: spacing.xs3, overflow: 'hidden' }}><View style={{ backgroundColor: contextBarIsDanger(percent) ? colors.destructive : colors.primary, borderRadius: radius.pill, height: 10, width: `${percent}%` }} /></View>
      </View>
    </Sheet>
  );
}
