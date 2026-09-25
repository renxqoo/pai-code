import * as React from 'react';
import { Linking, Text } from 'react-native';
import type { MarkdownInline } from '@/features/chat/markdown/markdown-types';
import { isSafeExternalUrl } from '@/features/chat/markdown/safe-external-url';
import { monospaceFont } from '@/components/monospace-font';

function renderNode(node: MarkdownInline, key: number): React.ReactNode {
  if (node.kind === 'text') return node.text;
  if (node.kind === 'code') return <Text key={key} style={{ fontFamily: monospaceFont }}>{node.text}</Text>;
  if (node.kind === 'strong') return <Text key={key} style={{ fontWeight: '700' }}>{renderInlineNodes(node.content)}</Text>;
  if (node.kind === 'emphasis') return <Text key={key} style={{ fontStyle: 'italic' }}>{renderInlineNodes(node.content)}</Text>;
  if (!isSafeExternalUrl(node.href)) return renderInlineNodes(node.content);
  return (
    <Text accessibilityRole="link" key={key} onPress={() => void Linking.openURL(node.href).catch(() => undefined)}>
      {renderInlineNodes(node.content)}
    </Text>
  );
}

export function renderInlineNodes(nodes: readonly MarkdownInline[]): React.ReactNode[] {
  return nodes.map((node, index) => renderNode(node, index));
}
