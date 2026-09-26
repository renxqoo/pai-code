import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius, type } from '@/theme/tokens';
import { rowPressStyle } from '@/components/ui/row-press-style';
import { copy } from '@/strings/zh';
import { monospaceFont } from '@/components/monospace-font';

const collapsedLines = 5;

type CodeBlockProps = {
  code: string;
  language?: string | undefined;
  title?: string | undefined;
  lineCount?: number | undefined;
};

export function CodeBlock({ code, language, title, lineCount }: CodeBlockProps) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = React.useState(false);
  const lines = code.split('\n');
  const visibleLines = expanded ? lines : lines.slice(0, collapsedLines);
  return (
    <View testID="timeline-code-block" style={{ borderColor: colors.divider, borderRadius: radius.md, borderWidth: 1, marginVertical: 10, overflow: 'hidden' }}>
      <Pressable accessibilityLabel={`${expanded ? copy.codeCollapse : copy.expandCodeLines(Math.max(0, lines.length - collapsedLines))}：${title ?? copy.codeDefaultTitle}`} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => ({ alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, opacity: pressed ? 0.62 : 1, paddingHorizontal: 13 })}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: type.row.fontSize, fontWeight: '600' }}>{title ?? copy.codeDefaultTitle}</Text><Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: type.meta.fontSize, marginLeft: 8 }}>{language ?? copy.codeDefaultLanguage}</Text><Text style={{ color: colors.textFaint, fontSize: type.meta.fontSize, marginLeft: 'auto' }}>{lineCount ?? lines.length} {copy.codeLineUnit}</Text>{expanded ? <ChevronDown color={colors.textFaint} size={16} /> : <ChevronRight color={colors.textFaint} size={16} />}
      </Pressable>
      <Text selectable style={{ color: colors.text, fontFamily: monospaceFont, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight, padding: 13 }}>{visibleLines.join('\n')}</Text>
      {lines.length > collapsedLines ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={rowPressStyle}>
          <Text style={{ color: colors.textMuted, fontSize: type.meta.fontSize }}>{expanded ? copy.codeCollapse : copy.expandCodeLines(lines.length - collapsedLines)}</Text>
          {expanded ? <ChevronDown color={colors.textFaint} size={14} /> : <ChevronRight color={colors.textFaint} size={14} />}
        </Pressable>
      ) : null}
    </View>
  );
}
