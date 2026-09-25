import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';

type CodeBlockProps = { message: ChatMessage };

export function CodeBlock({ message }: CodeBlockProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = React.useState(false);
  const lines = message.text.split('\n');
  const visibleLines = expanded ? lines : lines.slice(0, 5);
  return (
    <View testID="timeline-code-block" style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 7, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', minHeight: 42, paddingHorizontal: 13 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{message.title ?? '代码'}</Text><Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 8 }}>{message.language ?? 'text'}</Text><Text style={{ color: colors.textFaint, fontSize: 10, marginLeft: 'auto' }}>{message.lineCount ?? lines.length} 行</Text>{expanded ? <ChevronDown color={colors.textFaint} size={16} /> : <ChevronRight color={colors.textFaint} size={16} />}
      </Pressable>
      <Text selectable style={{ color: colors.text, fontFamily: 'Menlo', fontSize: 12, lineHeight: 19, padding: 13 }}>{visibleLines.join('\n')}</Text>
      {lines.length > 5 ? <Text accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={{ color: colors.textMuted, fontSize: 11, paddingBottom: 10, paddingHorizontal: 13 }}>{expanded ? '收起代码' : `展开剩余 ${lines.length - 5} 行`}</Text> : null}
    </View>
  );
}
