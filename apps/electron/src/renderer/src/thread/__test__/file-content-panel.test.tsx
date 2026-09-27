import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FileContentPanel } from '../file-content-panel';
import { fileLines, readFooterHint } from '../file-lines';
import { ToolCallDetail } from '../tool-call-detail';
import type { ToolCallModel } from '../thread-model';

function call(overrides: Partial<ToolCallModel>): ToolCallModel {
  return {
    id: 'c1',
    name: 'read',
    argsPreview: 'src/a.ts',
    subagents: [],
    editHunks: [],
    output: '',
    exitCode: 0,
    durationMs: 5,
    status: 'ok',
    ...overrides,
  };
}

describe('fileLines 输出 → 行号 + 内容', () => {
  test('行号前缀三种形态都解析（→ / | / 制表符）', () => {
    expect(fileLines('1→const a = 1;\n2 | const b = 2;\n3\tconst c = 3;').map((line) => [line.number, line.text])).toEqual([
      [1, 'const a = 1;'],
      [2, 'const b = 2;'],
      [3, 'const c = 3;'],
    ]);
  });

  test('无行号前缀：按出现序兜底编号（工具换实现也不塌）', () => {
    expect(fileLines('alpha\nbeta').map((line) => line.number)).toEqual([1, 2]);
  });

  test('空行跳过、行数有上界（长文件不撑爆 DOM）', () => {
    expect(fileLines('\n\nx\n\ny')).toHaveLength(2);
    const many = Array.from({ length: 900 }, (_, i) => `${i + 1}→line`).join('\n');
    expect(fileLines(many)).toHaveLength(500);
  });

  test('续读提示：末尾 hint 抽出，无 hint 返回 null', () => {
    expect(readFooterHint('1→a\n[offset=1200] more lines')).toBe('[offset=1200] more lines');
    expect(readFooterHint('1→a\n2→b')).toBeNull();
  });
});

describe('FileContentPanel 文件内容面板', () => {
  test('行号列 + 内容列，带「文件内容」标签与复制入口', () => {
    const html = renderToStaticMarkup(
      <FileContentPanel call={call({ output: '1→const a = 1;\n2→const b = 2;' })} />,
    );
    expect(html).toContain('文件内容');
    expect(html).toContain('const a = 1;');
    expect(html).toContain('tabular-nums');
  });

  test('运行中：内容走波纹加载态', () => {
    const html = renderToStaticMarkup(<FileContentPanel call={call({ output: '1→x', status: 'running' })} />);
    expect(html).toContain('shimmer-text');
  });
});

describe('ToolCallDetail 按种类分派', () => {
  test('read：走文件内容面板（有行号列），不挂通用输出面板', () => {
    const html = renderToStaticMarkup(<ToolCallDetail call={call({ name: 'read', output: '1→const a = 1;' })} />);
    expect(html).toContain('文件内容');
    // 通用输出面板的专属头是「输出」标签（复制按钮的 aria 不算）
    expect(html).not.toContain('>输出</span>');
  });

  test('bash：走通用输出面板', () => {
    const html = renderToStaticMarkup(<ToolCallDetail call={call({ name: 'bash', output: 'total 8' })} />);
    expect(html).toContain('>输出</span>');
    expect(html).toContain('total 8');
  });

  test('edit：补丁不在行详情（已迁到文件级 diff 区，行详情无输出即不渲染）', () => {
    const html = renderToStaticMarkup(
      <ToolCallDetail call={call({ name: 'edit', editHunks: [{ oldText: 'old', newText: 'new', path: 'a.ts' }] })} />,
    );
    expect(html).not.toContain('text-diff-del');
  });

  test('read 但无输出：降级不渲染空壳', () => {
    expect(renderToStaticMarkup(<ToolCallDetail call={call({ name: 'read' })} />)).not.toContain('文件内容');
  });
});
