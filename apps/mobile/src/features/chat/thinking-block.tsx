import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
import type { TimelineBlock } from '@/features/chat/timeline-blocks';

type ThinkingBlockProps = { block: Extract<TimelineBlock, { kind: 'thinking' }> };

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = React.useState(false);
  return (
    <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 6, overflow: 'hidden' }}>
      <Pressable accessibilityLabel="展开或收起思考过程" accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ alignItems: 'center', flexDirection: 'row', minHeight: 44, paddingHorizontal: 12 }}>
        <BrainCircuit color={colors.textMuted} size={17} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginLeft: 8 }}>思考过程</Text><Text style={{ color: colors.textFaint, fontSize: 11, marginLeft: 'auto' }}>{block.messages.length} 步</Text>{expanded ? <ChevronDown color={colors.textFaint} size={16} /> : <ChevronRight color={colors.textFaint} size={16} />}
      </Pressable>
      {expanded ? <View style={{ paddingBottom: 10, paddingHorizontal: 12 }}>{block.messages.map((message, index) => <View key={message.id} style={{ borderTopColor: colors.divider, borderTopWidth: index === 0 ? 0 : 1, paddingTop: index === 0 ? 0 : 9 }}><Text selectable style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>{message.text}</Text></View>)}</View> : null}
    </View>
  );
}
