import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThreadHeader } from '../thread-header';
import { projectMenuItems, sessionMenuItems, viewMenuItems } from '../header-menus';
import type { ThreadStatusKind } from '../thread-status';

const LABELS = {
  newTask: '新建',
  toggleMaximize: '切换最大化',
  viewMenuAria: '打开视图',
  changes: '会话变更',
  statusAria: '会话状态',
  renameTitleAria: '重命名会话',
  projectMenuAria: '项目操作',
  sessionMenuAria: '会话操作',
  statusLabel: '运行中',
};

const PROJECT_MENU = projectMenuItems({
  openMenu: ['在访达中打开', '在终端中打开', '在编辑器中打开'],
  copyPath: '复制路径',
});

const VIEW_MENU = viewMenuItems({ diff: 'Diff', agents: '子代理' });

const SESSION_MENU = sessionMenuItems(
  {
    rename: '重命名',
    copyId: '复制会话 ID',
    reloadTrusted: '以受信模式重开',
    reloadUntrusted: '以非受信模式重开',
    close: '关闭会话',
  },
  false,
);

function render(overrides: Partial<Parameters<typeof ThreadHeader>[0]> = {}): string {
  return renderToStaticMarkup(
    <ThreadHeader
      projectName="agent-app"
      sessionTitle="新会话"
      sidebarCollapsed={false}
      status="idle"
      additions={0}
      deletions={0}
      labels={LABELS}
      projectMenu={PROJECT_MENU}
      sessionMenu={SESSION_MENU}
      viewMenu={VIEW_MENU}
      onProjectAction={() => undefined}
      onViewAction={() => undefined}
      onRenameTitle={() => undefined}
      onStatusJump={() => undefined}
      onOpenChanges={() => undefined}
      onSessionAction={() => undefined}
      onNewTask={() => undefined}
      onToggleMaximize={() => undefined}
      {...overrides}
    />,
  );
}

describe('ThreadHeader', () => {
  test('身份区：项目名 + 标题 + 新建；空变更角标弱化仍可点', () => {
    const html = render();
    expect(html).toContain('agent-app');
    expect(html).toContain('新会话');
    expect(html).toContain('新建');
    expect(html).toContain('会话变更');
    expect(html).toContain('+0');
    expect(html).toContain('-0');
  });

  test('变更角标渲染真实增删数字', () => {
    const html = render({ additions: 34, deletions: 16 });
    expect(html).toContain('+34');
    expect(html).toContain('-16');
  });

  test.each<[ThreadStatusKind, string]>([
    ['running', '运行中'],
    ['permission', '等待权限'],
    ['compacting', '压缩中'],
    ['queued', '排队中'],
  ])('状态 chip %s 显示文案 %s', (status, label) => {
    const html = render({ status, labels: { ...LABELS, statusLabel: label } });
    expect(html).toContain(label);
  });

  test('空闲态不渲染状态 chip（降噪）', () => {
    const html = render({ status: 'idle' });
    expect(html).not.toContain('会话状态');
  });

  test('等待权限态带呼吸动画类；项目/会话/视图菜单 aria 就位', () => {
    const html = render({ status: 'permission', labels: { ...LABELS, statusLabel: '等待权限' } });
    expect(html).toContain('animate-pulse');
    expect(html).toContain('aria-label="项目操作"');
    expect(html).toContain('aria-label="会话操作"');
    expect(html).toContain('aria-label="打开视图"');
  });
});
