/** ANSI SGR 样式状态（16 色 + 常用样式）。 */
export type AnsiColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite';

export type AnsiStyle = {
  readonly bold: boolean;
  readonly dim: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly inverse: boolean;
  readonly strike: boolean;
  readonly fg: AnsiColor | null;
};

export type AnsiSegment = { readonly text: string; readonly style: AnsiStyle | null };

const plain: AnsiStyle = {
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strike: false,
  fg: null,
};

const baseFg: readonly AnsiColor[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const brightFg: readonly AnsiColor[] = [
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

function withStyle(style: AnsiStyle, patch: Partial<AnsiStyle>): AnsiStyle {
  return { ...style, ...patch };
}

/** 单条 SGR 参数序列 → 状态变更（未知码忽略；38 扩展色只接 16 色档，其余忽略）。 */
function applySgr(style: AnsiStyle, params: string): AnsiStyle {
  // ITU T.416 冒号子参数语法（38:5:n 等）归一到分号形态再解析
  const codes = params.replace(/:/g, ';').split(';');
  let current = style;
  for (let index = 0; index < codes.length; index += 1) {
    const raw = codes[index] ?? '0';
    const code = raw.length === 0 ? 0 : Number.parseInt(raw, 10);
    if (Number.isNaN(code)) continue;
    if (code === 0) current = plain;
    else if (code === 1) current = withStyle(current, { bold: true });
    else if (code === 2) current = withStyle(current, { dim: true });
    else if (code === 3) current = withStyle(current, { italic: true });
    else if (code === 4) current = withStyle(current, { underline: true });
    else if (code === 7) current = withStyle(current, { inverse: true });
    else if (code === 9) current = withStyle(current, { strike: true });
    else if (code === 22) current = withStyle(current, { bold: false, dim: false });
    else if (code === 23) current = withStyle(current, { italic: false });
    else if (code === 24) current = withStyle(current, { underline: false });
    else if (code === 27) current = withStyle(current, { inverse: false });
    else if (code === 29) current = withStyle(current, { strike: false });
    else if (code >= 30 && code <= 37) current = withStyle(current, { fg: baseFg[code - 30] ?? null });
    else if (code === 39) current = withStyle(current, { fg: null });
    else if (code >= 90 && code <= 97) current = withStyle(current, { fg: brightFg[code - 90] ?? null });
    else if (code === 38 || code === 48) {
      const mode = codes[index + 1];
      if (mode === '5') {
        const n = Number.parseInt(codes[index + 2] ?? '', 10);
        if (code === 38 && Number.isInteger(n) && n >= 0 && n <= 15) {
          current = withStyle(current, { fg: (n < 8 ? baseFg[n] : brightFg[n - 8]) ?? null });
        }
        index += 2;
      } else if (mode === '2') {
        index += 4;
      }
    }
  }
  return current;
}

const isPlain = (style: AnsiStyle): boolean =>
  !style.bold && !style.dim && !style.italic && !style.underline && !style.inverse && !style.strike && style.fg === null;

/** ANSI SGR 转义 → 样式段（T56 M2）：SGR 的 16 色/粗体/斜体/下划线/反显/删除线生效，
 * 其余转义序列（光标移动、OSC、控制字符）整段丢弃；非法/截断序列剥掉 ESC 后降级为
 * 可见纯文本，不抛异常。无转义符的文本原样返回单段（与纯文本渲染逐字节一致）。 */
export function parseAnsiSegments(input: string): readonly AnsiSegment[] {
  if (!input.includes('\x1b')) return [{ text: input, style: null }];

  const segments: AnsiSegment[] = [];
  let style = plain;
  let buffer = '';
  const flush = (): void => {
    if (buffer.length > 0) {
      segments.push({ text: buffer, style: isPlain(style) ? null : style });
      buffer = '';
    }
  };

  let index = 0;
  while (index < input.length) {
    const esc = input.indexOf('\x1b', index);
    if (esc === -1) {
      buffer += input.slice(index);
      break;
    }
    buffer += input.slice(index, esc);
    const next = input[esc + 1];
    if (next === '[') {
      let end = esc + 2;
      while (end < input.length && !isFinalByte(input[end])) end += 1;
      if (end >= input.length) {
        // 截断的 CSI：剥掉 ESC 后降级为可见纯文本
        buffer += input.slice(esc + 1);
        break;
      }
      if (input[end] === 'm') {
        flush();
        style = applySgr(style, input.slice(esc + 2, end));
      }
      index = end + 1;
    } else if (next === ']') {
      let end = esc + 2;
      let terminated = false;
      while (end < input.length) {
        if (input[end] === '\x07') {
          end += 1;
          terminated = true;
          break;
        }
        if (input[end] === '\x1b' && input[end + 1] === '\\') {
          end += 2;
          terminated = true;
          break;
        }
        end += 1;
      }
      if (!terminated) {
        // 截断的 OSC（常见于上游截前 N 字符）：剥掉 ESC] 后降级为可见纯文本，不吞后文
        buffer += input.slice(esc + 2);
        break;
      }
      index = end;
    } else if (next === undefined) {
      break;
    } else {
      index = esc + 2;
    }
  }
  flush();
  // 有转义符时丢弃其余控制字符（保留换行/制表；\r\n 进度条只留换行）
  const isControl = (char: string): boolean => {
    const code = char.charCodeAt(0);
    return (code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f;
  };
  const stripControls = (value: string): string => {
    let out = '';
    for (const char of value) if (!isControl(char)) out += char;
    return out;
  };
  const cleaned = segments
    .map((segment) => ({ ...segment, text: stripControls(segment.text) }))
    .filter((segment) => segment.text.length > 0);
  return cleaned.length > 0 ? cleaned : [{ text: '', style: null }];
}

function isFinalByte(char: string | undefined): boolean {
  if (char === undefined) return false;
  const code = char.charCodeAt(0);
  return code >= 0x40 && code <= 0x7e;
}
