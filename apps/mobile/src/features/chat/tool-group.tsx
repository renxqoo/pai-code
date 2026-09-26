import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, CircleAlert, Wrench } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm, spacing, type } from '@/theme/tokens';
import { copy } from '@/strings/zh';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';
import type { ChatMessage } from '@/types/domain';
import { ToolRow } from '@/features/chat/tool-row';

type ToolGroupProps = { messages: readonly ChatMessage[]; onOpen: (message: ChatMessage) => void };

export function ToolGroup({ messages, onOpen }: ToolGroupProps) {
  const { colors } = useAppTheme();
  const failed = messages.some((message) => message.status === 'error');
  const running = messages.findLast((message) => message.status === 'running');
  const [expanded, setExpanded] = React.useState(false);
  return (
    <View style={{ marginTop: rhythm.rowToRow }}>
      <Pressable
        accessibilityLabel={`${expanded ? copy.collapseToolGroup : copy.expandToolGroup}：${messages.length} 个工具`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={rowPressStyle}
      >
        <Marker style={styles.marker}>
          <MarkerIcon loading={running !== undefined} color={colors.textFaint} testID="tool-group-spinner">
            {failed ? <CircleAlert color={colors.destructive} size={16} /> : <Wrench color={colors.textFaint} size={16} />}
          </MarkerIcon>
          <MarkerContent shimmer={running !== undefined} numberOfLines={1} style={{ color: failed ? colors.destructive : colors.textMuted, marginRight: 6 }}>{`${messages.length} ${copy.toolGroupUnit}`}</MarkerContent>
        </Marker>
        {running ? <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: type.meta.fontSize, marginLeft: 6, maxWidth: '46%' }}>{`${copy.toolGroupRunning} · ${running.title ?? copy.activityFallback}`}</Text> : null}
        {expanded ? <ChevronDown color={colors.textFaint} size={15} /> : <ChevronRight color={colors.textFaint} size={15} />}
      </Pressable>
      {expanded ? (
        <View style={{ borderLeftColor: colors.divider, borderLeftWidth: 1, marginLeft: 7, paddingLeft: spacing.xs2 }}>
          {messages.map((message) => <ToolRow key={message.id} message={message} onOpen={onOpen} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = { marker: { flexShrink: 1 } };
