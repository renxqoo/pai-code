import * as React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-context';
import { rhythm, spacing } from '@/theme/tokens';
import type {
  MarkdownBlock as MarkdownBlockNode,
  MarkdownListItem,
} from '@/features/chat/markdown/markdown-types';
import { renderInlineNodes } from '@/features/chat/markdown/render-inline-nodes';
import { CodeBlock } from '@/features/chat/code-block';

const headingSize: Record<number, number> = { 1: 22, 2: 19, 3: 17, 4: 15, 5: 14, 6: 13 };

function listMarkers(items: readonly MarkdownListItem[], ordered: boolean, start: number): string[] {
  let counter = start - 1;
  return items.map((item) => {
    if (item.indent === 0) counter += 1;
    return ordered && item.indent === 0 ? `${counter}. ` : ordered ? '· ' : '• ';
  });
}

type MarkdownBlockProps = { block: MarkdownBlockNode };

export function MarkdownBlock({ block }: MarkdownBlockProps) {
  const { colors } = useAppTheme();
  if (block.kind === 'heading') {
    return <Text accessibilityRole="header" style={{ color: colors.text, fontSize: headingSize[block.level] ?? 13, fontWeight: '700', marginTop: rhythm.blockGap }}>{renderInlineNodes(block.content)}</Text>;
  }
  if (block.kind === 'paragraph') {
    return <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 24, marginTop: rhythm.blockGap }}>{renderInlineNodes(block.content)}</Text>;
  }
  if (block.kind === 'quote') {
    return (
      <View testID="markdown-quote" style={{ borderLeftColor: colors.border, borderLeftWidth: 2, marginTop: rhythm.blockGap, paddingLeft: spacing.xs2 }}>
        <Text selectable style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21 }}>{renderInlineNodes(block.content)}</Text>
      </View>
    );
  }
  if (block.kind === 'divider') {
    return <View accessibilityRole="none" testID="markdown-divider" style={{ backgroundColor: colors.divider, height: 1, marginVertical: rhythm.blockGap }} />;
  }
  if (block.kind === 'code') {
    return <CodeBlock code={block.code} language={block.language.length > 0 ? block.language : undefined} />;
  }
  const markers = listMarkers(block.items, block.ordered, block.start);
  return (
    <View style={{ marginTop: rhythm.blockGap }}>
      {block.items.map((item, index) => (
        <Text key={index} selectable style={{ color: colors.text, fontSize: 15, lineHeight: 23, paddingLeft: spacing.xs3 + item.indent * spacing.xs3, marginTop: index === 0 ? 0 : rhythm.listItemGap }}>
          {markers[index]}{renderInlineNodes(item.content)}
        </Text>
      ))}
    </View>
  );
}
