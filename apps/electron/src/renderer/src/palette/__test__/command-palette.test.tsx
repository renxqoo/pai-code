import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CommandPalette } from '../command-palette';
import { actionItems, sessionItems, type PaletteItem } from '../palette-items';

const LABELS = {
  aria: '命令面板',
  placeholder: '搜索操作、会话、文件、命令…',
  empty: '没有匹配项',
  groups: { actions: '操作', sessions: '会话', files: '文件', commands: '命令', settings: '设置' },
};

const ITEMS: readonly PaletteItem[] = [
  ...actionItems(
    {
      newTask: '新建任务',
      openDiff: '打开 Diff 面板',
      openAgents: '打开子代理面板',
      openFinder: '在访达中打开',
      openTerminal: '在终端中打开',
      openEditor: '在编辑器中打开',
      copyPath: '复制项目路径',
      copySessionId: '复制会话 ID',
      closeSession: '关闭当前会话',
      openSettings: '打开设置',
      openUsage: '打开用量',
    },
    { hasSession: true, hasCwd: true, modifier: '⌘' },
  ),
  ...sessionItems([{ id: 't1', title: '重构会话', projectName: 'agent-app' }]),
];

const SEARCH = (): Promise<string[] | null> => Promise.resolve(['src/a.ts']);

function render(open: boolean): string {
  return renderToStaticMarkup(
    <CommandPalette open={open} onClose={() => undefined} items={ITEMS} searchFiles={SEARCH} labels={LABELS} onSelect={() => undefined} />,
  );
}

describe('CommandPalette', () => {
  test('关态零渲染', () => {
    expect(render(false)).toBe('');
  });

  test('开态：底部锚定浮层 + 输入框 + 分组词条（操作/会话）', () => {
    const html = render(true);
    expect(html).toContain('bottom-');
    expect(html).toContain('aria-label="命令面板"');
    expect(html).toContain('搜索操作、会话、文件、命令…');
    expect(html).toContain('新建任务');
    expect(html).toContain('重构会话');
    expect(html).toContain('agent-app');
    expect(html).toContain('⌘N');
  });
});
