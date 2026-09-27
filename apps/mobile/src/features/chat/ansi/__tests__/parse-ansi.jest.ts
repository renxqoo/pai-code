import { describe, expect, it } from '@jest/globals';
import { parseAnsiSegments, type AnsiColor, type AnsiStyle } from '@/features/chat/ansi/parse-ansi';

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

describe('parseAnsiSegments（T56 M2：SGR 解析）', () => {
  it('无转义符文本原样单段（与纯文本渲染逐字节一致）', () => {
    expect(parseAnsiSegments('hello 世界\ttab\nnext')).toEqual([{ text: 'hello 世界\ttab\nnext', style: null }]);
    expect(parseAnsiSegments('')).toEqual([{ text: '', style: null }]);
  });

  it('SGR 状态机：上色/复位，段按样式切分', () => {
    expect(parseAnsiSegments('\x1b[31mred\x1b[0m plain')).toEqual([
      { text: 'red', style: style({ fg: 'red' }) },
      { text: ' plain', style: null },
    ]);
  });

  it.each([
    ['1', style({ bold: true })],
    ['3', style({ italic: true })],
    ['4', style({ underline: true })],
    ['7', style({ inverse: true })],
    ['9', style({ strike: true })],
    ['2', style({ dim: true })],
    ['32', style({ fg: 'green' })],
    ['92', style({ fg: 'brightGreen' })],
    ['38;5;9', style({ fg: 'brightRed' })],
    ['38:5:9', style({ fg: 'brightRed' })],
    ['1;4;35', style({ bold: true, underline: true, fg: 'magenta' })],
  ])('SGR %s → 样式状态', (params, expected) => {
    expect(parseAnsiSegments(`\x1b[${params}mx`)).toEqual([{ text: 'x', style: expected }]);
  });

  it('样式关闭码逐项复位', () => {
    expect(parseAnsiSegments('\x1b[1;4;9;31mA\x1b[22;24;29;39mB')).toEqual([
      { text: 'A', style: style({ bold: true, underline: true, strike: true, fg: 'red' }) },
      { text: 'B', style: null },
    ]);
  });

  it('非 SGR 转义序列整段丢弃（光标移动/OSC/杂散 ESC），不产生乱码', () => {
    expect(parseAnsiSegments('a\x1b[2Jb\x1b]0;title\x07c\x1b7d')).toEqual([{ text: 'abcd', style: null }]);
    expect(parseAnsiSegments('a\x1b]8;;https://x\x1b\\b')).toEqual([{ text: 'ab', style: null }]);
  });

  it('截断/非法序列剥 ESC 降级为可见纯文本，不抛异常', () => {
    expect(parseAnsiSegments('a\x1b[31')).toEqual([{ text: 'a[31', style: null }]);
    expect(parseAnsiSegments('\x1b')).toEqual([{ text: '', style: null }]);
    expect(parseAnsiSegments('\x1b[38;5;999mx')).toEqual([{ text: 'x', style: null }]);
  });

  it('截断 OSC 余文可见（症状：未终止 OSC 把其后日志尾部整段静默吞掉）', () => {
    const segments = parseAnsiSegments('\x1b]0;title重要输出');
    expect(segments.map((segment) => segment.text).join('')).toBe('0;title重要输出');
  });

  it('有转义符时丢弃其余控制字符、保留换行制表（\\r\\n 进度条不糊）', () => {
    expect(parseAnsiSegments('\x1b[32m100%\x1b[0m\r\nnext\x08')).toEqual([
      { text: '100%', style: style({ fg: 'green' }) },
      { text: '\nnext', style: null },
    ]);
  });

  it('连续同色段不合并由渲染并列无感，段文本不丢不重', () => {
    const segments = parseAnsiSegments('\x1b[31mA\x1b[31mB');
    expect(segments.map((segment) => segment.text).join('')).toBe('AB');
    expect(segments.every((segment) => segment.style?.fg === 'red')).toBe(true);
  });

  it('16 色码表全量走一遍（30-37/90-97/39/0）', () => {
    const colors: readonly AnsiColor[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
    colors.forEach((fg, index) => {
      expect(parseAnsiSegments(`\x1b[${30 + index}mx`)).toEqual([{ text: 'x', style: style({ fg }) }]);
      expect(parseAnsiSegments(`\x1b[${90 + index}mx`)).toEqual([
        { text: 'x', style: style({ fg: (`bright${fg[0]?.toUpperCase()}${fg.slice(1)}` as AnsiColor) }) },
      ]);
    });
  });
});
