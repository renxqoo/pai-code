import type { TextStyle } from 'react-native';

import type { ColorScheme } from '@/theme/colors';
import type { AnsiColor, AnsiStyle } from '@/features/chat/ansi/parse-ansi';

/** 16 色 → 主题 token（T56 裁决：压到主题灰阶/红绿两系）：
 * 红系→destructive、绿系→diffAdd；黑/蓝/青/品红→灰阶弱档；黄→次级；白→正文（强调）。
 * 亮度随主题走，不引入主题外的固定色值。 */
function ansiFgColor(fg: AnsiColor | null, colors: ColorScheme): string | null {
  if (fg === null) return null;
  if (fg === 'red' || fg === 'brightRed') return colors.destructive;
  if (fg === 'green' || fg === 'brightGreen') return colors.diffAdd;
  if (fg === 'yellow' || fg === 'brightYellow') return colors.textSecondary;
  if (fg === 'white' || fg === 'brightWhite') return colors.text;
  if (fg === 'black') return colors.textMuted;
  if (fg === 'brightBlack') return colors.textFaint;
  return colors.textMuted;
}

/** SGR 样式状态 → RN 文本样式（未设置的属性不落样式，继承外层）。 */
export function ansiTextStyle(style: AnsiStyle, colors: ColorScheme): TextStyle {
  const mapped: TextStyle = {};
  if (style.bold) mapped.fontWeight = '700';
  if (style.italic) mapped.fontStyle = 'italic';
  const decoration: ('underline' | 'line-through')[] = [];
  if (style.underline) decoration.push('underline');
  if (style.strike) decoration.push('line-through');
  if (decoration.length > 0) mapped.textDecorationLine = decoration.join(' ') as TextStyle['textDecorationLine'];
  if (style.dim) mapped.opacity = 0.6;
  const fg = ansiFgColor(style.fg, colors);
  if (style.inverse) {
    mapped.backgroundColor = fg ?? colors.text;
    mapped.color = colors.background;
  } else if (fg !== null) {
    mapped.color = fg;
  }
  return mapped;
}
