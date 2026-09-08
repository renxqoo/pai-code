import { describe, expect, test } from 'bun:test';

import { baseNameOf, projectDirsOf } from '../project-dirs';

describe('projectDirsOf（新会话已知目录快捷列表）', () => {
  test('活跃 + 历史合并去重，按最近活跃排序，遵守上限', () => {
    const active = [
      { cwd: '/w/a', at: 10 },
      { cwd: '/w/b', at: 30 },
    ];
    const saved = [
      { cwd: '/w/b', at: 20 },
      { cwd: '/w/c', at: 40 },
      { cwd: '', at: 99 },
    ];
    expect(projectDirsOf(active, saved, 6)).toEqual(['/w/c', '/w/b', '/w/a']);
    expect(projectDirsOf(active, saved, 2)).toEqual(['/w/c', '/w/b']);
  });

  test('空输入 → 空数组；同 cwd 取两侧最大时刻', () => {
    expect(projectDirsOf([], [], 6)).toEqual([]);
    expect(projectDirsOf([{ cwd: '/w/x', at: 5 }], [{ cwd: '/w/x', at: 50 }], 6)).toEqual(['/w/x']);
  });

  test('对抗审查补：尾斜杠形态归一去重（保留首次见到的写法）', () => {
    const active = [{ cwd: '/w/a', at: 10 }];
    const saved = [{ cwd: '/w/a/', at: 30 }];
    expect(projectDirsOf(active, saved, 6)).toEqual(['/w/a']);
  });

  test('对抗审查补：limit 边界（0 与恰等于条目数）', () => {
    const items = [
      { cwd: '/w/1', at: 3 },
      { cwd: '/w/2', at: 2 },
      { cwd: '/w/3', at: 1 },
    ];
    expect(projectDirsOf(items, [], 0)).toEqual([]);
    expect(projectDirsOf(items, [], 3)).toEqual(['/w/1', '/w/2', '/w/3']);
    expect(projectDirsOf(items, [], 2)).toEqual(['/w/1', '/w/2']);
  });
});

describe('baseNameOf', () => {
  test('取最后一段；尾斜杠与空段忽略；空路径回退整串', () => {
    expect(baseNameOf('/w/agent-app')).toBe('agent-app');
    expect(baseNameOf('/w/agent-app/')).toBe('agent-app');
    expect(baseNameOf('agent-app')).toBe('agent-app');
    expect(baseNameOf('/')).toBe('/');
    expect(baseNameOf('')).toBe('');
  });
});
