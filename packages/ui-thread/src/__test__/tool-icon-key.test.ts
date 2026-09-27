import { describe, expect, test } from 'bun:test';

import { toolGroupIconKey, toolIconKey } from '../tool-icon-key';
import type { ToolNameRef } from '../tool-refs';

/** 图标语义键断言：语义（哪类工具配哪支图标）只有这一套，组件映射在各端。 */
describe('toolIconKey 类别图标语义', () => {
  test('编辑类铅笔、阅读书、命令终端、其余扳手', () => {
    expect(toolIconKey('edit')).toBe('pencil');
    expect(toolIconKey('write')).toBe('pencil');
    expect(toolIconKey('read')).toBe('book');
    expect(toolIconKey('bash')).toBe('terminal');
    expect(toolIconKey('grep')).toBe('wrench');
    expect(toolIconKey('ls')).toBe('wrench');
    expect(toolIconKey('task')).toBe('wrench');
    expect(toolIconKey('mcp__x__y')).toBe('wrench');
  });

  test('edit 与 write 同一支铅笔（都是文件改写）；read 与 bash 不同语义', () => {
    expect(toolIconKey('edit')).toBe(toolIconKey('write'));
    expect(toolIconKey('read')).not.toBe(toolIconKey('bash'));
    expect(toolIconKey('grep')).toBe(toolIconKey('ls'));
  });

  test('工具名大小写不敏感', () => {
    expect(toolIconKey('Bash')).toBe('terminal');
    expect(toolIconKey(' READ ')).toBe('book');
  });
});

function named(...names: readonly string[]): ToolNameRef[] {
  return names.map((name) => ({ name }));
}

describe('toolGroupIconKey 组头图标语义', () => {
  test('单一类别桶取该桶图标，混合批次落扳手', () => {
    expect(toolGroupIconKey(named('edit', 'write'))).toBe(toolIconKey('edit'));
    expect(toolGroupIconKey(named('bash', 'bash'))).toBe('terminal');
    expect(toolGroupIconKey(named('edit', 'write', 'read'))).toBe('wrench');
    expect(toolGroupIconKey(named('grep', 'ls'))).toBe('wrench');
    expect(toolGroupIconKey(named())).toBe('wrench');
  });

  test('调用到达序不影响组头图标（同批次多次渲染稳定）', () => {
    expect(toolGroupIconKey(named('edit', 'write'))).toBe(toolGroupIconKey(named('write', 'edit')));
  });
});
