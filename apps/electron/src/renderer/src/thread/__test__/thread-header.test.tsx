import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThreadHeader } from '../thread-header';
import { projectMenuItems, sessionMenuItems } from '../header-menus';

const LABELS = {
  toggleSplitView: '切换分栏',
  renameTitleAria: '重命名会话',
  projectMenuAria: '项目操作',
  sessionMenuAria: '会话操作',
};

const PROJECT_MENU = projectMenuItems({
  openMenu: ['在访达中打开', '在终端中打开', '在编辑器中打开'],
  copyPath: '复制路径',
});

const SESSION_MENU = sessionMenuItems(
  {
    rename: '重命名',
    copyId: '复制会话 ID',
    reloadTrusted: '以受信模式重开',
    reloadUntrusted: '以非信模式重开',
    archive: '归档会话',
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
      panelOpen={false}
      labels={LABELS}
      projectMenu={PROJECT_MENU}
      sessionMenu={SESSION_MENU}
      onProjectAction={() => undefined}
      onRenameTitle={() => undefined}
      onTogglePanel={() => undefined}
      onSessionAction={() => undefined}
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

  test('症状回归：超长标题展示区限半窗宽（max-w 省略号截断，撑不爆头部）', () => {
    const html = render({ sessionTitle: '很长的会话标题'.repeat(20) });
    const title = /<button[^>]*>[\s\S]*?很长的会话标题[\s\S]*?<\/button>/.exec(html);
    if (title === null) throw new Error('title button not found');
    expect(title[0]).toContain('max-w-[46vw]');
    expect(title[0]).toContain('truncate');
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

  test('症状回归：头部不渲染状态胶囊（运行/权限/压缩/排队状态均无入口与圆点）', () => {
    const html = render();
    expect(html).not.toContain('会话状态');
    expect(html).not.toContain('animate-pulse');
    for (const label of ['运行中', '等待权限', '压缩中', '排队中']) {
      expect(html).not.toContain(label);
    }
  });

  test('症状回归：头部不渲染全屏切换（面板开关是右端唯一图标按钮）', () => {
    const html = render();
    expect(html).not.toContain('切换最大化');
    expect(html).not.toContain('lucide-maximize-2');
    // 面板开关仍在位（红框右侧那个竖条图标保留）
    expect(html).toContain('aria-label="切换分栏"');
  });

  test('项目/会话菜单 aria 就位；「+视图」菜单已删（用户裁决——与面板开关/快捷键重复）', () => {
    const html = render();
    expect(html).toContain('aria-label="项目操作"');
    expect(html).toContain('aria-label="会话操作"');
    expect(html).not.toContain('打开视图');
  });
});