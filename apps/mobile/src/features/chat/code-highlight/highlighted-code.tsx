import * as React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/theme-context';
import { type CodeLines, type CodeTheme, type CodeToken, tokenizeCode } from '@/features/chat/code-highlight/tokenize';

type HighlightedCodeProps = { code: string; language?: string | undefined; style?: StyleProp<TextStyle> | undefined };

type HighlightState = { readonly key: string; readonly lines: CodeLines | null };

/** 高亮代码文本：shiki 词法 → 逐 token 自绘 Text（颜色随 shiki 主题走）。
 * 高亮未就绪/不支持/异常一律展示等宽纯文本（与无高亮时逐字节一致）；
 * 行间换行逐行显式输出（shiki 对空行给空 token 行，靠首 token 前缀换行会把空行吞掉）。 */
export function HighlightedCode({ code, language, style }: HighlightedCodeProps) {
  const { isDark } = useAppTheme();
  const theme: CodeTheme = isDark ? 'github-dark' : 'github-light';
  const key = `${language ?? ''}|${theme}|${code}`;
  const [state, setState] = React.useState<HighlightState>({ key, lines: null });
  React.useEffect(() => {
    let alive = true;
    void tokenizeCode(code, language, theme).then((lines) => {
      if (alive) setState({ key, lines });
    });
    return () => {
      alive = false;
    };
  }, [code, language, theme, key]);
  // 换码/换主题后旧 token 不残留（state 与 key 不匹配时按纯文本展示）
  const lines = state.key === key ? state.lines : null;
  if (lines === null) return <Text selectable style={style}>{code}</Text>;
  return (
    <Text selectable style={style}>
      {lines.map((row, rowIndex) => [
        ...row.map((token, tokenIndex) => (
          <Text key={`${rowIndex}-${tokenIndex}`} style={tokenStyle(token)}>
            {token.text}
          </Text>
        )),
        rowIndex < lines.length - 1 ? <Text key={`${rowIndex}-nl`}>{'\n'}</Text> : null,
      ])}
    </Text>
  );
}

function tokenStyle(token: CodeToken): TextStyle {
  const style: TextStyle = {};
  if (token.color !== null) style.color = token.color;
  if (token.bold) style.fontWeight = '700';
  if (token.italic) style.fontStyle = 'italic';
  return style;
}
