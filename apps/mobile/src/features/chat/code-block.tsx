import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/theme/theme-context';
import { radius } from '@/theme/tokens';
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
    <View testID="timeline-code-block" style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, marginVertical: 7, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', minHeight: 42, paddingHorizontal: 13 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{title ?? copy.codeDefaultTitle}</Text><Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 8 }}>{language ?? copy.codeDefaultLanguage}</Text><Text style={{ color: colors.textFaint, fontSize: 10, marginLeft: 'auto' }}>{lineCount ?? lines.length} {copy.codeLineUnit}</Text>{expanded ? <ChevronDown color={colors.textFaint} size={16} /> : <ChevronRight color={colors.textFaint} size={16} />}
      </Pressable>
      <Text selectable style={{ color: colors.text, fontFamily: monospaceFont, fontSize: 12, lineHeight: 19, padding: 13 }}>{visibleLines.join('\n')}</Text>
      {lines.length > collapsedLines ? <Text accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={{ color: colors.textMuted, fontSize: 11, paddingBottom: 10, paddingHorizontal: 13 }}>{expanded ? copy.codeCollapse : copy.expandCodeLines(lines.length - collapsedLines)}</Text> : null}
    </View>
  );
}
