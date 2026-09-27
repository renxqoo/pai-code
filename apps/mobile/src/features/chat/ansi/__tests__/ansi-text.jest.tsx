import * as React from 'react';
import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { AnsiText } from '@/features/chat/ansi/ansi-text';
import { ansiTextStyle } from '@/features/chat/ansi/ansi-style';
import { lightColors } from '@/theme/colors';
import type { AnsiStyle } from '@/features/chat/ansi/parse-ansi';

const style = (patch: Partial<AnsiStyle>): AnsiStyle => ({
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strike: false,
  fg: null,
  ...patch,
});

const styleOf = (node: { props: { style?: unknown } }): Record<string, unknown> => {
  const entries = (Array.isArray(node.props.style) ? node.props.style : [node.props.style]) as readonly (Record<string, unknown> | undefined)[];
  return Object.assign({}, ...entries.map((entry) => entry ?? {}));
};

describe('AnsiText（T56 M2：shell 文本渲染）', () => {
  it('ANSI 样式段落点正确，无转义符文本与纯文本逐字节一致', async () => {
    const colored = await render(<AnsiText text={'\x1b[31;1mERR\x1b[0m ok'} />);
    expect(colored.getByText('ERR')).toBeTruthy();
    expect(styleOf(colored.getByText('ERR'))).toMatchObject({ color: lightColors.destructive, fontWeight: '700' });
    expect(colored.getByText(' ok')).toBeTruthy();
    expect(styleOf(colored.getByText(' ok'))).toMatchObject({});

    const plain = await render(<AnsiText text={'纯文本 100%'} />);
    expect(plain.getByText('纯文本 100%')).toBeTruthy();
  });

  it('ANSI 转义乱码不落屏幕（旧症状：转义符显示成脏字符）', async () => {
    const view = await render(<AnsiText text={'\x1b[2K\x1b[1G构建完成\x1b]0;title\x07'} />);
    const tree = JSON.stringify(view.toJSON());
    expect(tree).toContain('构建完成');
    expect(tree).not.toContain('\\u001b');
  });

  it('16 色压到主题灰阶/红绿两系（T56 裁决），反显换底色', () => {
    expect(ansiTextStyle(style({ fg: 'red' }), lightColors)).toMatchObject({ color: lightColors.destructive });
    expect(ansiTextStyle(style({ fg: 'green' }), lightColors)).toMatchObject({ color: lightColors.diffAdd });
    expect(ansiTextStyle(style({ fg: 'blue' }), lightColors)).toMatchObject({ color: lightColors.textMuted });
    expect(ansiTextStyle(style({ fg: 'black' }), lightColors)).toMatchObject({ color: lightColors.textMuted });
    expect(ansiTextStyle(style({ fg: 'brightBlack' }), lightColors)).toMatchObject({ color: lightColors.textFaint });
    expect(ansiTextStyle(style({ fg: 'white' }), lightColors)).toMatchObject({ color: lightColors.text });
    expect(ansiTextStyle(style({ fg: 'yellow' }), lightColors)).toMatchObject({ color: lightColors.textSecondary });
    expect(ansiTextStyle(style({ inverse: true, fg: 'red' }), lightColors)).toMatchObject({
      backgroundColor: lightColors.destructive,
      color: lightColors.background,
    });
  });

  it('样式风暴降级单节点（症状：万次颜色切换造出万级嵌套 Text 卡顿）', async () => {
    const storm = Array.from({ length: 400 }, (_, index) => `\x1b[3${index % 8}ms${index}`).join('');
    const view = await render(<AnsiText text={storm} />);
    expect((view.toJSON() as { children?: unknown[] }).children).toHaveLength(1);
  });

  it('样式开关各自落点：dim 降透明、下划线/删除线可叠加、空样式不落字段', () => {
    expect(ansiTextStyle(style({ dim: true }), lightColors)).toMatchObject({ opacity: 0.6 });
    expect(ansiTextStyle(style({ underline: true }), lightColors)).toMatchObject({ textDecorationLine: 'underline' });
    expect(ansiTextStyle(style({ strike: true }), lightColors)).toMatchObject({ textDecorationLine: 'line-through' });
    expect(ansiTextStyle(style({ underline: true, strike: true }), lightColors)).toMatchObject({
      textDecorationLine: 'underline line-through',
    });
    expect(ansiTextStyle(style({}), lightColors)).toEqual({});
  });
});
