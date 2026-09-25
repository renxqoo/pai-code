import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PulseChip } from '../pulse-chip';
import type { PulseChipSegments } from '../pulse-assembly';

/**
 * 收起态胶囊（T44）：三段聚合渲染与缺段隐藏（全空只留面板名）、摘要进无障碍名。
 */

function noop(): void {}

describe('PulseChip', () => {
  test('三段齐出：更改 + 进程 + 运行', () => {
    const segments: PulseChipSegments = {
      changes: { additions: 739, deletions: 290 },
      progress: { done: 5, total: 5 },
      running: 2,
    };
    const html = renderToStaticMarkup(<PulseChip segments={segments} onExpand={noop} />);
    expect(html).toContain('速览');
    expect(html).toContain('更改');
    expect(html).toContain('+739');
    expect(html).toContain('-290');
    expect(html).toContain('5/5');
    expect(html).toContain('2 工作中');
  });

  test('缺段隐藏：无变更不显更改、无任务不显进度、无运行不显计数', () => {
    const html = renderToStaticMarkup(<PulseChip segments={{ changes: null, progress: { done: 0, total: 3 }, running: 0 }} onExpand={noop} />);
    expect(html).not.toContain('更改');
    expect(html).toContain('0/3');
    expect(html).not.toContain('工作中');
  });

  test('全空只留面板名（无分隔线）', () => {
    const html = renderToStaticMarkup(<PulseChip segments={{ changes: null, progress: null, running: 0 }} onExpand={noop} />);
    expect(html).toContain('速览');
    expect(html).not.toContain('bg-border');
  });

  test('无障碍名含三段摘要', () => {
    const html = renderToStaticMarkup(
      <PulseChip segments={{ changes: { additions: 3, deletions: 1 }, progress: { done: 1, total: 2 }, running: 1 }} onExpand={noop} />,
    );
    expect(html).toContain('更改 +3 -1');
    expect(html).toContain('1/2');
    expect(html).toContain('展开面板');
  });
});
