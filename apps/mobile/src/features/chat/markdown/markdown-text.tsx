import * as React from 'react';
import { View } from 'react-native';
import { parseMarkdown } from '@/features/chat/markdown/parse-markdown';
import { MarkdownBlock } from '@/features/chat/markdown/markdown-block';

type MarkdownTextProps = { source: string };

export function MarkdownText({ source }: MarkdownTextProps) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  if (blocks.length === 0) return null;
  return <View>{blocks.map((block, index) => <MarkdownBlock block={block} key={`${index}-${block.kind}`} />)}</View>;
}
