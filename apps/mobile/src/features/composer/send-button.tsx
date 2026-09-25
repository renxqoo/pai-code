import * as React from 'react';
import { Pressable } from 'react-native';
import { ArrowUp, Square } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';

type SendButtonProps = { canSend: boolean; generating: boolean; onPress: () => void };

export function SendButton({ canSend, generating, onPress }: SendButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={generating ? '停止生成' : '发送消息'}
      accessibilityRole="button"
      disabled={!canSend && !generating}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', backgroundColor: generating ? colors.destructive : canSend ? colors.primary : colors.surfaceSubtle, borderRadius: radius.pill, flexShrink: 0, height: 44, justifyContent: 'center', marginLeft: 2, opacity: pressed ? 0.65 : 1, width: 44 })}
    >
      {generating ? <Square color={colors.primaryText} fill={colors.primaryText} size={13} /> : <ArrowUp color={canSend ? colors.primaryText : colors.textFaint} size={19} strokeWidth={2.4} />}
    </Pressable>
  );
}
