import * as React from 'react';
import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import type { HunkLine } from '@paiapp/ui-thread';
import type { EditHunkView } from '@paiapp/contracts';

import { DiffLines } from '@/features/chat/diff-lines';
import { wordDiffByLine, wordParts } from '@/features/chat/diff-word';

const line = (key: string, tone: HunkLine['tone'], text: string, startsHunk = false): HunkLine => ({ key, tone, text, startsHunk });

const styleOf = (node: { props: { style?: unknown } }): Record<string, unknown> => {
  const entries = (Array.isArray(node.props.style) ? node.props.style : [node.props.style]) as readonly (Record<string, unknown> | undefined)[];
  return Object.assign({}, ...entries.map((entry) => entry ?? {}));
};

describe('diff 词级对照（T56 M3）', () => {
  it('删除/新增按序配对，两侧各自标出差异词', () => {
    const map = wordDiffByLine([
      line('r1', 'remove', 'const alpha = 1;'),
      line('a1', 'add', 'const alpha = 2;'),
    ]);
    const removed = map.get('r1') ?? [];
    const added = map.get('a1') ?? [];
    expect(removed.map((part) => part.text).join('')).toBe('const alpha = 1;');
    expect(removed.filter((part) => part.changed).map((part) => part.text).join('').trim()).toBe('1');
    expect(added.filter((part) => part.changed).map((part) => part.text).join('').trim()).toBe('2');
  });

  it('未配对的多余行不进词级表（调用方退整行着色）', () => {
    const map = wordDiffByLine([
      line('r1', 'remove', 'only removed'),
      line('r2', 'remove', 'also removed'),
      line('a1', 'add', 'only added'),
    ]);
    expect(map.has('r1')).toBe(true);
    expect(map.has('r2')).toBe(false);
    expect(map.has('a1')).toBe(true);
  });

  it('上下文行打断配对（不跨段落配对）', () => {
    const map = wordDiffByLine([
      line('r1', 'remove', 'before ctx'),
      line('c1', 'plain', 'context line'),
      line('a1', 'add', 'after ctx'),
    ]);
    expect(map.size).toBe(0);
  });

  it('超长行走整行跳过词级（>2000 字符，changed=false）', () => {
    const long = 'x'.repeat(2001);
    expect(wordParts(long, `${long}y`, 'add')).toEqual([{ text: `${long}y`, changed: false }]);
    expect(wordParts(long, `${long}y`, 'remove')).toEqual([{ text: long, changed: false }]);
  });

  it('DiffLines 渲染：差异词行内加粗，其余原词不动', async () => {
    const hunks: readonly EditHunkView[] = [
      {
        path: 'src/a.ts',
        oldText: 'const alpha = one',
        newText: 'const alpha = two',
      },
    ];
    const view = await render(<DiffLines hunks={hunks} />);
    expect(view.getAllByText('const alpha = ')).toHaveLength(2);
    expect(styleOf(view.getByText('one'))).toMatchObject({ fontWeight: '700' });
    expect(styleOf(view.getByText('two'))).toMatchObject({ fontWeight: '700' });
    expect(styleOf(view.getAllByText('const alpha = ')[0] as { props: { style?: unknown } })).not.toMatchObject({ fontWeight: '700' });
  });
});
