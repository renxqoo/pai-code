import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as renderStatic } from 'react-dom/server';

import { HistorySection } from '../history-section';

const SAVED = [
  { sessionPath: '/s/a.jsonl', title: '活跃会话', cwd: '/w', modifiedAt: 1_000, messageCount: 3 },
  { sessionPath: '/s/b.jsonl', title: '归档会话', cwd: '/w', modifiedAt: 2_000, messageCount: 5 },
] as const;

function render(archived: ReadonlySet<string>): string {
  return renderStatic(
    <HistorySection
      saved={[...SAVED]}
      pinned={new Set<string>()}
      archived={archived}
      projects={['/w']}
      onTogglePin={() => undefined}
      onReveal={() => undefined}
      onOpenSaved={() => undefined}
      onRefresh={() => undefined}
      onRestore={() => undefined}
      onOpenArchived={() => undefined}
    />,
  );
}

describe('HistorySection 已归档分区', () => {
  test('归档行进「已归档」分区并带恢复动作；未归档行留在主列表', () => {
    const html = render(new Set(['/s/b.jsonl']));
    expect(html).toContain('已归档');
    expect(html).toContain('归档会话');
    expect(html).toContain('恢复');
    // 主列表前置（活跃会话出现在归档标题之前）
    expect(html.indexOf('活跃会话')).toBeLessThan(html.indexOf('已归档'));
  });

  test('无归档时不渲染「已归档」标题', () => {
    const html = render(new Set());
    expect(html).not.toContain('已归档');
    expect(html).toContain('活跃会话');
    expect(html).toContain('归档会话');
  });
});
