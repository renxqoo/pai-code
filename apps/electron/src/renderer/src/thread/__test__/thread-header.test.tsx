import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThreadHeader } from '../thread-header';
import { projectMenuItems, sessionMenuItems, viewMenuItems } from '../header-menus';
import type { ThreadStatusKind } from '../thread-status';

const LABELS = {
  toggleMaximize: '切换最大化',
  toggleSplitView: '切换分栏',
  viewMenuAria: '打开视图',
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

const VIEW_MENU = viewMenuItems({ openFile: '打开文件', diff: 'Diff', agents: '子代理' });

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
      panelOpen={false}
      labels={LABELS}
      projectMenu={PROJECT_MENU}
      sessionMenu={SESSION_MENU}
      viewMenu={VIEW_MENU}
      onProjectAction={() => undefined}
      onViewAction={() => undefined}
      onRenameTitle={() => undefined}
      onStatusJump={() => undefined}
      onTogglePanel={() => undefined}
      onSessionAction={() => undefined}
      onToggleMaximize={() => undefined}
      {...overrides}
    />,
  );
}

describe('ThreadHeader', () => {
  test('身份区：项目名 + 标题；不渲染变更徽标与新建按钮（用户裁决删除）', () => {
    const html = render();
    expect(html).toContain('agent-app');
    expect(html).toContain('新会话');
    expect(html).not.toContain('lucide-diff');
    expect(html).not.toMatch(/\+\d/);
    expect(html).not.toContain('新建');
  });

  test.each<[boolean, string]>([
    [true, 'true'],
    [false, 'false'],
  ])('右侧面板开关随面板态展开（panelOpen=%s）', (panelOpen, expanded) => {
    const html = render({ panelOpen });
    const toggle = /<button[^>]*aria-label="切换分栏"[^>]*>[\s\S]*?<\/button>/.exec(html);
    if (toggle === null) throw new Error('panel toggle not found in rendered markup');
    expect(toggle[0]).toContain(`aria-expanded="${expanded}"`);
    expect(toggle[0]).toContain('lucide-panel-right');
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
