import * as React from 'react';
import { Text, View } from 'react-native';
import { Check, CircleAlert } from 'lucide-react-native';

import { useAppTheme } from '@/theme/theme-context';
import { rhythm, type } from '@/theme/tokens';
import type { ChatMessage } from '@/types/domain';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';

const firstText = (...values: readonly (string | undefined)[]): string =>
  values.find((value) => value !== undefined && value.trim().length > 0)?.trim() ?? '';

type StatusLineProps = { message: ChatMessage };

/** 状态信封行：阶段结论一行可见（成功弱化、失败红色整句、运行中 spinner）。 */
export function StatusLine({ message }: StatusLineProps) {
  const { colors } = useAppTheme();
  const failed = message.status === 'failed';
  const running = message.status === 'running';
  const label = firstText(message.text, message.summary);
  const detail = firstText(message.summary);
  const tone = failed ? colors.destructive : colors.textMuted;
  return (
    <View style={{ marginTop: rhythm.rowToRow, minHeight: 32, justifyContent: 'center' }}>
      <Marker>
        <MarkerIcon loading={running} color={failed ? colors.destructive : colors.textFaint} testID={running ? 'status-spinner' : undefined}>
          {failed ? <CircleAlert color={tone} size={16} /> : <Check color={colors.textFaint} size={16} />}
        </MarkerIcon>
        <MarkerContent shimmer={running} numberOfLines={1} style={{ color: tone, fontSize: type.meta.fontSize }}>
          {label}
        </MarkerContent>
        {detail.length > 0 && detail !== label ? (
          <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: type.meta.fontSize }}>{detail}</Text>
        ) : null}
      </Marker>
    </View>
  );
}
