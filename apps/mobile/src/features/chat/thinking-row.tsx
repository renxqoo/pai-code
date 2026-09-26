import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm, type } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import type { ChatMessage } from '@/types/domain';

type ThinkingRowProps = { message: ChatMessage };

export function ThinkingRow({ message }: ThinkingRowProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = React.useState(false);
  return (
    <View style={{ marginTop: rhythm.rowToRow }}>
      <Pressable
        accessibilityLabel={`${expanded ? copy.collapseThinking : copy.expandThinking}：${copy.thinkingLabel}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={rowPressStyle}
      >
        <Text style={{ color: colors.textMuted, fontSize: type.row.fontSize, fontWeight: '600', marginRight: 6 }}>{copy.thinkingLabel}</Text>
        {expanded ? <ChevronDown color={colors.textFaint} size={15} /> : <ChevronRight color={colors.textFaint} size={15} />}
      </Pressable>
      {expanded ? (
        <ScrollView style={{ maxHeight: 200 }}>
          <Text selectable style={{ color: colors.textMuted, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight }}>{message.text}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}
