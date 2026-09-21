import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileRead, isReadableRelativePath, looksBinary } from '../file-read';

/** 路径合法性表：顶栏文件读取只接受「file/search 可枚举面」内的相对路径。 */
describe('isReadableRelativePath', () => {
  test.each([
    ['src/main.ts', true],
    ['a/b/c.txt', true],
    ['weird name.md', true],
    ['中文文件.md', true],
    ['', false],
    ['/etc/passwd', false],
    ['C:/Windows/system32', false],
    ['C:\\Windows', false],
    ['a\\b', false],
    ['../escape.txt', false],
    ['a/../../escape', false],
    ['a/./b', false],
    ['./a', false],
    ['.env', false],
    ['config/.hidden.json', false],
    ['a//b', false],
    ['a/', false],
    ['/a', false],
    ['a\0b', false],
    ['a\nb', false],
  ])('%s → %s', (path: string, expected: boolean) => {
    expect(isReadableRelativePath(path)).toBe(expected);
  });
});

describe('looksBinary', () => {
  test('前 8KiB 含 NUL 判二进制；纯文本与超窗 NUL 不判', () => {
    expect(looksBinary(Buffer.from('hello world'))).toBe(false);
    expect(looksBinary(Buffer.from([0x61, 0x00, 0x62]))).toBe(true);
    // NUL 出现在嗅探窗口之后（8KiB + 1 起）：窗口内纯文本 → 不判二进制
    const lateNul = Buffer.alloc(8 * 1024 + 8, 0x61);
    lateNul[8 * 1024 + 1] = 0;
    expect(looksBinary(lateNul)).toBe(false);
    expect(looksBinary(Buffer.alloc(0))).toBe(false);
  });
});

describe('createFileRead（真实 fs 隔离世界）', () => {
  const work = mkdtempSync(join(tmpdir(), 'pai-file-read-'));
  const project = join(work, 'project');
  const outside = join(work, 'outside');
  const reader = createFileRead();

  test('正常读取：内容/size/truncated=false', () => {
    mkdirSync(join(project, 'src'), { recursive: true });
    writeFileSync(join(project, 'src', 'main.ts'), 'const x = 1;\n');
    const outcome = reader.read(project, 'src/main.ts');
    expect(outcome).toEqual({ ok: true, data: { content: 'const x = 1;\n', truncated: false, size: 13 } });
  });

  test('不存在 → not_found；目录 → invalid_path；cwd 缺失 → cwd_not_found', () => {
    expect(reader.read(project, 'missing.ts')).toEqual({ ok: false, error: { kind: 'io_failed', message: 'not_found' } });
    expect(reader.read(project, 'src')).toEqual({ ok: false, error: { kind: 'invalid_params', message: 'invalid_path' } });
    expect(reader.read(join(work, 'no-such-dir'), 'a.txt')).toEqual({ ok: false, error: { kind: 'cwd_not_found' } });
  });

  test('符号链接逃逸 → path_forbidden', () => {
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.txt'), 'outside\n');
    symlinkSync(join(outside, 'secret.txt'), join(project, 'leak.txt'));
    expect(reader.read(project, 'leak.txt')).toEqual({ ok: false, error: { kind: 'path_forbidden', message: 'path_forbidden' } });
  });

  test('二进制 → binary_file', () => {
    writeFileSync(join(project, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02]));
    expect(reader.read(project, 'blob.bin')).toEqual({ ok: false, error: { kind: 'invalid_params', message: 'binary_file' } });
  });

  test('超过 2MiB 截断：size=真实值、truncated=true、内容=前 2MiB', () => {
    const filler = 'a'.repeat(64 * 1024);
    writeFileSync(join(project, 'big.log'), '');
    // 2MiB + 3 字节：写满 33 个 64KiB 块 + 3 字节尾巴
    for (let index = 0; index < 32; index += 1) {
      writeFileSync(join(project, 'big.log'), filler, { flag: 'a' });
    }
    writeFileSync(join(project, 'big.log'), 'xyz', { flag: 'a' });
    const outcome = reader.read(project, 'big.log');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.size).toBe(2 * 1024 * 1024 + 3);
      expect(outcome.data.truncated).toBe(true);
      expect(outcome.data.content.length).toBe(2 * 1024 * 1024);
      expect(outcome.data.content.endsWith('aaa')).toBe(true);
    }
    rmSync(work, { recursive: true, force: true });
  });
});
