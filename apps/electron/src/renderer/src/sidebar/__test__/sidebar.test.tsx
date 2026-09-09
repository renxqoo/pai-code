import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProjectGroup } from '../build-project-groups';
import type { SessionCardModel } from '../session-card-model';
import { Sidebar, type SidebarProps } from '../sidebar';
import { MODIFIER_KEY_LABEL } from '@/lib/platform';

/**
 * 渲染冒烟：经 react-dom/server 渲染侧栏两视图，验证快捷操作、视图切换、
 * 置顶区、会话行相对时间、显示更多与底部工具条产出预期 DOM。
 * 交互（选中/重命名/折叠）由装配层与模型单测覆盖，这里只锁渲染形态。
 */
function makeSession(overrides: Partial<SessionCardModel> = {}): SessionCardModel {
  return {
    id: 'session-1',
    projectName: 'pai',
    title: '会话标题',
    version: '0.1.0',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/sessions/session-1.jsonl',
    streaming: false,
    lastActivityAt: 1000,
    ...overrides,
  };
}

function noop(): void {}

function makeGroup(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    key: 'pai',
    projectName: 'pai',
    visible: [makeSession({ id: 'grouped-session', title: '编写技术架构文档' })],
    total: 1,
    expanded: false,
    latestActivityAt: 1000,
    ...overrides,
  };
}

function makeProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    width: 264,
    collapsed: false,
    view: 'grouped',
    onViewChange: noop,
    searchOpen: false,
    onSearchOpenChange: noop,
    onOpenSearch: noop,
    searchFocusToken: 0,
    searchQuery: '',
    onSearchQueryChange: noop,
    pinned: [],
    timeList: [],
    projectGroups: [],
    collapsedGroups: new Set<string>(),
    onToggleGroupCollapse: noop,
    onExpandGroup: noop,
    ages: {},
    activeSessionId: 'session-1',
    filterEmptyLabel: '没有匹配的会话',
    emptyTasksLabel: '暂无任务，按 ⌘N 开始',
    onNewThread: noop,
    onCollapseSidebar: noop,
    onSelectSession: noop,
    onTogglePin: noop,
    onNewTaskInProject: noop,
    onRemoveProject: noop,
    onProjectFiles: noop,
    projectFiles: null,
    onCloseProjectFiles: noop,
    footerActions: [
      { label: '设置', onSelect: noop },
      { label: '工作流', onSelect: noop },
      { label: '用量', onSelect: noop },
    ],
    refreshAction: { label: '刷新会话', onSelect: noop },
    ...overrides,
  };
}

describe('Sidebar 渲染冒烟', () => {
  test('快捷操作区与视图切换行在位（新建任务、两个 Tab、快捷键徽标）', () => {
    const html = renderToStaticMarkup(<Sidebar {...makeProps()} />);
    expect(html).toContain('新建任务');
    expect(html).toContain('搜索');
    expect(html).toContain('自动化');
    expect(html).toContain('插件市场');
    expect(html).toContain(`${MODIFIER_KEY_LABEL}N`);
    expect(html).toContain(`${MODIFIER_KEY_LABEL}K`);
    expect(html).toContain('分组');
    expect(html).toContain('项目');
    expect(html).toContain('收起侧栏');
  });

  test('分组视图：平铺会话行渲染标题与相对时间标签', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        {...makeProps({
          timeList: [makeSession({ id: 'a', title: '修复排队消息' })],
          ages: { a: '3小时' },
        })}
      />,
    );
    expect(html).toContain('修复排队消息');
    expect(html).toContain('3小时');
  });

  test('置顶区：pinned 非空时渲染已置顶标题与行首钉子（两视图共用）', () => {
    const pinned = [makeSession({ id: 'p', title: '新建分支并用 Bun 重构' })];
    const grouped = renderToStaticMarkup(<Sidebar {...makeProps({ pinned })} />);
    expect(grouped).toContain('已置顶');
    expect(grouped).toContain('新建分支并用 Bun 重构');
    expect(grouped).toContain('lucide-pin'); // 行首钉子图标在位
    const projects = renderToStaticMarkup(
      <Sidebar
        {...makeProps({
          view: 'projects',
          pinned,
          projectGroups: [makeGroup()],
        })}
      />,
    );
    expect(projects).toContain('已置顶');
    expect(projects).toContain('新建分支并用 Bun 重构');
  });

  test('项目视图：文件夹行 + 缩进会话行 + 项目区标题', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        {...makeProps({
          view: 'projects',
          projectGroups: [makeGroup()],
          ages: { 'grouped-session': '刚刚' },
        })}
      />,
    );
    expect(html).toContain('>项目</div>'); // 项目区标题（与切换 Tab 的 span 区分）
    expect(html).toContain('pai');
    expect(html).toContain('编写技术架构文档');
    expect(html).toContain('刚刚');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('展开/折叠项目分组 · pai');
  });

  test('项目视图：文件夹行带「更多」菜单触发器（三条线图标，hover 展开三项菜单）', () => {
    const projects = renderToStaticMarkup(
      <Sidebar {...makeProps({ view: 'projects', projectGroups: [makeGroup()] })} />,
    );
    expect(projects).toContain('aria-label="更多操作"');
    expect(projects).toContain('lucide-list-tree');
    const grouped = renderToStaticMarkup(<Sidebar {...makeProps({ view: 'grouped' })} />);
    expect(grouped).not.toContain('更多操作');
  });

  test('项目行无 focus-within 常驻边框（点击行内折叠钮后行周残留灰框的症状）：焦点环只随键盘聚焦出现', () => {
    const html = renderToStaticMarkup(
      <Sidebar {...makeProps({ view: 'projects', projectGroups: [makeGroup()] })} />,
    );
    expect(html).not.toContain('focus-within:ring-3');
    expect(html).toContain('has-[button:focus-visible]:ring-3');
  });

  test('项目文件面板打开：内容区整体让位（快捷区/底部工具条不渲染），返回行/搜索框/树在位', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        {...makeProps({
          projectFiles: {
            name: 'side-proj',
            path: '/tmp/side-proj',
            tree: [
              {
                name: 'src',
                path: 'src',
                kind: 'dir',
                children: [{ name: 'main.ts', path: 'src/main.ts', kind: 'file', children: [] }],
              },
            ],
            loading: false,
          },
        })}
      />,
    );
    expect(html).toContain('side-proj');
    expect(html).toContain('/tmp/side-proj');
    expect(html).toContain('aria-label="关闭"'); // 返回钮
    expect(html).toContain('<input'); // 面板搜索框
    expect(html).toContain('padding-left:22px'); // 树第二层缩进
    expect(html).not.toContain('自动化'); // 快捷区让位
    expect(html).not.toContain('插件市场');
    expect(html).not.toContain('设置'); // 底部工具条让位
  });

  test('显示更多：total 超过可见条数时出现，展开后消失', () => {
    const truncated = renderToStaticMarkup(
      <Sidebar
        {...makeProps({
          view: 'projects',
          projectGroups: [makeGroup({ total: 6, visible: [makeSession({ id: 'v' })] })],
        })}
      />,
    );
    expect(truncated).toContain('显示更多');
    const full = renderToStaticMarkup(
      <Sidebar {...makeProps({ view: 'projects', projectGroups: [makeGroup()] })} />,
    );
    expect(full).not.toContain('显示更多');
  });

  test('搜索框展开渲染输入行（有内容时带清空钮）；流式会话带进行中指示', () => {
    const searching = renderToStaticMarkup(
      <Sidebar {...makeProps({ searchOpen: true, searchQuery: 'pai' })} />,
    );
    expect(searching).toContain('<input');
    expect(searching).toContain('清空搜索');
    const idle = renderToStaticMarkup(<Sidebar {...makeProps({ searchOpen: true })} />);
    expect(idle).toContain('<input');
    expect(idle).not.toContain('清空搜索');
    const streaming = renderToStaticMarkup(
      <Sidebar
        {...makeProps({
          timeList: [makeSession({ id: 's', title: '流式会话', streaming: true })],
        })}
      />,
    );
    expect(streaming).toContain('aria-label="进行中"');
  });

  test('搜索非空且列表全空：显示空态文案', () => {
    const html = renderToStaticMarkup(
      <Sidebar {...makeProps({ searchQuery: 'zzz', filterEmptyLabel: '没有匹配的会话' })} />,
    );
    expect(html).toContain('没有匹配的会话');
    expect(html).not.toContain('已置顶');
  });

  test('零会话（非过滤）显示引导文案；项目视图不渲染孤零区头', () => {
    const grouped = renderToStaticMarkup(<Sidebar {...makeProps({ emptyTasksLabel: '暂无任务，按 ⌘N 开始' })} />);
    expect(grouped).toContain('暂无任务，按 ⌘N 开始');
    const projects = renderToStaticMarkup(
      <Sidebar {...makeProps({ view: 'projects', emptyTasksLabel: '暂无任务，按 ⌘N 开始' })} />,
    );
    expect(projects).toContain('暂无任务，按 ⌘N 开始');
    expect(projects).not.toContain('>项目</div>');
  });

  test('底部工具条在位（动作与刷新）', () => {
    const html = renderToStaticMarkup(<Sidebar {...makeProps()} />);
    expect(html).toContain('设置');
    expect(html).toContain('工作流');
    expect(html).toContain('用量');
    expect(html).toContain('刷新会话');
  });
});
