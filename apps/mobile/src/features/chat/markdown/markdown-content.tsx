import * as React from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';
import type { MarkedStyles, RendererInterface } from 'react-native-marked';

type MarkdownContentProps = {
  source: string;
  renderer: RendererInterface;
  styles: MarkedStyles;
};

/** 正文节点装配：useMarkdown 拿节点自行排版——对话流本就是 ScrollView，不引入 FlatList 嵌套。 */
export function MarkdownContent({ source, renderer, styles }: MarkdownContentProps) {
  const nodes = useMarkdown(source, { renderer, styles });
  if (nodes.length === 0) return null;
  return <View>{nodes}</View>;
}
