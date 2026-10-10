import * as React from 'react';
import { Pressable, Text } from 'react-native';

import { useAppTheme } from '@/theme/theme-context';
import { layout } from '@/theme/tokens';

type GroupMoreRowProps = { label: string; onPress: () => void };

/** 组末「显示更多」：超限折叠的项目组由此放行全量会话（左对齐组内会话行）。 */
export function GroupMoreRow({ label, onPress }: GroupMoreRowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ paddingLeft: layout.groupRowIndent, paddingVertical: 7, opacity: pressed ? 0.62 : 1 })}
      testID="project-group-show-more"
    >
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}