import * as React from 'react';
import { Text } from 'react-native';

import { useAppTheme } from '@/theme/theme-context';
import { MarkdownContent } from '@/features/chat/markdown/markdown-content';
import { RenderGuard } from '@/features/chat/markdown/render-guard';
import { markdownStyles } from '@/features/chat/markdown/markdown-theme';
import { isNestingTooDeep } from '@/features/chat/markdown/nesting-guard';
import { normalizeTaskLists } from '@/features/chat/markdown/normalize-task-lists';
import { SafeMarkdownRenderer } from '@/features/chat/markdown/safe-markdown-renderer';

type MarkdownTextProps = { source: string };

/** assistant/system 正文的 Markdown 渲染（react-native-marked 引擎 + 安全渲染器）。
 * 垃圾输入降级不崩（T56 §2 不变量 3）：病态嵌套走纯文本，解析/渲染异常由 RenderGuard 兜底。 */
export function MarkdownText({ source }: MarkdownTextProps) {
  const { colors } = useAppTheme();
  const renderer = React.useMemo(() => new SafeMarkdownRenderer(), []);
  const styles = React.useMemo(() => markdownStyles(colors), [colors]);
  const input = React.useMemo(() => normalizeTaskLists(source), [source]);
  const tooDeep = React.useMemo(() => isNestingTooDeep(source), [source]);
  const fallback = <Text selectable style={styles.text}>{source}</Text>;
  if (tooDeep) return fallback;
  return (
    <RenderGuard fallback={fallback}>
      <MarkdownContent renderer={renderer} source={input} styles={styles} />
    </RenderGuard>
  );
}
