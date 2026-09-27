import * as React from 'react';
import { Text, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer } from 'react-native-marked';
import type { ReactNode } from 'react';

import { type } from '@/theme/tokens';
import { CodeBlock } from '@/features/chat/code-block';
import { MarkdownImage } from '@/features/chat/markdown/markdown-image';
import { isSafeExternalUrl } from '@/features/chat/markdown/safe-external-url';

const listItemTypography: TextStyle = { fontSize: type.row.fontSize, lineHeight: type.row.lineHeight };

/** 基础 HTML 实体解码（剥标签后的残留实体；&amp; 最后解，保证只解一层）。 */
function decodeBasicEntities(value: string | ReactNode[]): string | ReactNode[] {
  if (typeof value !== 'string') return value;
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** 列表项子树文本降字级（T54 裁决：列表项 type.row 13px，不与正文同级）：
 * 文本叶在解析层统一拿正文样式，这里递归追加 row 字级——后写覆盖，嵌套样式安全生效；
 * 只作用于 Text 叶（View 收 TextStyle 是无效键）。 */
function scaleListItem(node: ReactNode): ReactNode {
  if (!React.isValidElement(node)) return node;
  const props = node.props as { style?: StyleProp<TextStyle>; children?: ReactNode };
  const children = React.Children.map(props.children, scaleListItem);
  if (node.type === Text) {
    return React.cloneElement(node, { style: [props.style, listItemTypography], children } as never);
  }
  return React.cloneElement(node, { children } as never);
}

/** 安全渲染器（T56 §2 不变量 1/2/4 的实现载体）：
 * - 链接仅 http/https 可点、图片仅 http/https 渲染，其余降级纯文本/alt——永不触发打开；
 * - HTML 剥标签降级纯文本，永不渲染原始 HTML；
 * - 围栏代码走唯一 CodeBlock（折叠 + 行数 + 语言），不双轨；
 * - 标题具 header 语义（读屏可按标题跳转）。 */
export class SafeMarkdownRenderer extends Renderer {
  heading(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <Text accessibilityRole="header" key={this.getKey()} style={styles}>
        {text}
      </Text>
    );
  }

  code(text: string, language?: string): ReactNode {
    return (
      <CodeBlock
        code={text}
        key={this.getKey()}
        language={language !== undefined && language.length > 0 ? language : undefined}
      />
    );
  }

  hr(styles?: ViewStyle): ReactNode {
    return <View accessibilityRole="none" key={this.getKey()} style={styles} testID="markdown-divider" />;
  }

  blockquote(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <View key={this.getKey()} style={styles} testID="markdown-quote">
        {children}
      </View>
    );
  }

  listItem(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <Text key={this.getKey()} style={styles as TextStyle}>
        {React.Children.map(children, scaleListItem)}
      </Text>
    );
  }

  link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    if (!isSafeExternalUrl(href)) return this.text(children, styles);
    return super.link(children, href, styles);
  }

  image(uri: string, alt?: string, style?: ImageStyle): ReactNode {
    if (!isSafeExternalUrl(uri)) return alt !== undefined && alt.length > 0 ? this.text(alt) : null;
    return <MarkdownImage alt={alt} key={this.getKey()} style={style} uri={uri} />;
  }

  linkImage(href: string, imageUrl: string, alt?: string, style?: ImageStyle): ReactNode {
    if (!isSafeExternalUrl(href) || !isSafeExternalUrl(imageUrl)) {
      return alt !== undefined && alt.length > 0 ? this.text(alt) : null;
    }
    return super.linkImage(href, imageUrl, alt, style);
  }

  html(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    const raw = typeof text === 'string' ? text.replace(/<[^>]*>/g, '') : text;
    return this.text(decodeBasicEntities(raw), styles);
  }
}
