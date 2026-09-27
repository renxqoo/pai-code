import type { TextStyle } from 'react-native';
import type { MarkedStyles } from 'react-native-marked';

import { monospaceFont } from '@/components/monospace-font';
import type { ColorScheme } from '@/theme/colors';
import { rhythm, spacing, type } from '@/theme/tokens';

const headingSize = { 1: 22, 2: 19, 3: 17, 4: 15, 5: 14, 6: 13 } as const;

/** 主题 token → react-native-marked 样式面（MarkdownText 每次换肤重算）。
 * 字级/灰阶/间距全部走 tokens 单一真相；表格为新增能力，边框用 divider 系 token。 */
export function markdownStyles(colors: ColorScheme): MarkedStyles {
  return {
    text: { color: colors.text, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
    paragraph: { marginTop: rhythm.blockGap },
    h1: heading(colors, 1),
    h2: heading(colors, 2),
    h3: heading(colors, 3),
    h4: heading(colors, 4),
    h5: heading(colors, 5),
    h6: heading(colors, 6),
    blockquote: {
      borderLeftColor: colors.border,
      borderLeftWidth: 2,
      marginTop: rhythm.blockGap,
      paddingLeft: spacing.xs2,
    },
    // 强调系显式钉色：库的默认样式 flatten 后会残留 #333333，深色底上不可读
    strong: { color: colors.text, fontWeight: '700' },
    em: { color: colors.text, fontStyle: 'italic' },
    strikethrough: { color: colors.text, textDecorationLine: 'line-through' },
    codespan: { backgroundColor: colors.surfaceSubtle, color: colors.text, fontFamily: monospaceFont },
    // 链接下划线：触屏无 hover 颜色不足以辨识可点
    link: { color: colors.text, textDecorationLine: 'underline' },
    hr: { backgroundColor: colors.divider, height: 1, marginVertical: rhythm.blockGap },
    list: { marginTop: rhythm.blockGap },
    li: { color: colors.text, fontSize: type.row.fontSize, lineHeight: type.row.lineHeight },
    table: { borderColor: colors.divider, borderWidth: 1, marginTop: rhythm.blockGap },
    tableRow: { borderColor: colors.divider, borderBottomWidth: 1 },
    // 文字样式由解析层的 text 样式承担（MDTable 将 cellStyle 落在 View 包装上）
    tableCell: {
      borderColor: colors.divider,
      borderRightWidth: 1,
      padding: spacing.xs2,
    },
  };
}

function heading(colors: ColorScheme, level: keyof typeof headingSize): TextStyle {
  return {
    color: colors.text,
    fontSize: headingSize[level],
    fontWeight: '700',
    marginTop: rhythm.blockGap,
  };
}
