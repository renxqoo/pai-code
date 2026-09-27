import * as React from 'react';
import { View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm } from '@/theme/tokens';
import { copy } from '@/strings/zh';

/** 对话执行中指示（与 PC 端 TurnLoadingRow 同形态）：旋转 loader 贴在消息流末尾、最后一条消息后面。
 * 不固定悬浮——它是消息流的一部分（输出正从这里长出来），随列表滚动；
 * 视觉本体只有旋转指示（与 PC 端一致），语义靠读屏标签。 */
export function TurnLoadingRow() {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel={copy.turnLoadingLabel}
      style={{ alignItems: 'center', flexDirection: 'row', height: 20, marginTop: rhythm.turnGap }}
    >
      <Spinner color={colors.textMuted} size={14} />
    </View>
  );
}
