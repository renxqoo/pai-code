import * as React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/theme-context';
import { ansiTextStyle } from '@/features/chat/ansi/ansi-style';
import { parseAnsiSegments } from '@/features/chat/ansi/parse-ansi';

type AnsiTextProps = { text: string; style?: StyleProp<TextStyle> | undefined };

/** 段数上限（防样式风暴：万次颜色切换会造出万级嵌套 Text 节点）：超限降级单节点纯文本，内容不丢。 */
const maxSegments = 300;

/** shell 文本渲染：ANSI 转义解成样式段（乱码根治），无转义符时与纯文本渲染逐字节一致。 */
export function AnsiText({ text, style }: AnsiTextProps) {
  const { colors } = useAppTheme();
  const segments = React.useMemo(() => parseAnsiSegments(text), [text]);
  if (segments.length > maxSegments) {
    return (
      <Text selectable style={style}>
        {segments.map((segment) => segment.text).join('')}
      </Text>
    );
  }
  return (
    <Text selectable style={style}>
      {segments.map((segment, index) => (
        <Text key={index} style={segment.style === null ? undefined : ansiTextStyle(segment.style, colors)}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}
