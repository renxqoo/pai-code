import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProjectGroup } from '../build-project-groups';
import { PinnedSection } from '../pinned-section';
import { ProjectSection } from '../project-section';
import type { SessionCardModel } from '../session-card-model';

/**
 * 分区级症状钉子（T32 §3.4 矩阵行 1 声明的「子组件级 SSR」去处——补齐旧侧栏
 * SSR 冒烟里随壳重写移除的 DOM 形态断言：折叠语义/更多菜单触发器/hover 淡入/
 * 行内焦点环/行距节律/显示更多截断）。
 */

function makeSession(id: string, overrides: Partial<SessionCardModel> = {}): SessionCardModel {
  return {
    id,
    projectName: 'pai',
    title: `会话-${id}`,
    version: '',
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/sessions/${id}.jsonl`,
    state: 'live',
    streaming: false,
    lastActivityAt: 1000,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    key: '/tmp/pai',
    projectName: 'pai',
    visible: [makeSession('a')],
    total: 1,
    expanded: false,
    latestActivityAt: 1000,
    ...overrides,
  };
}

describe('ProjectSection（SSR）', () => {
  test('文件夹行：折叠钮语义（aria-expanded + 展开折叠分组标题）与缩进行', () => {
    const html = renderToStaticMarkup(
      <ProjectSection group={makeGroup()} ages={{ a: '3小时' }} activeSessionId="a" />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('展开/折叠项目分组 · pai');
    expect(html).toContain('3小时'); // 组内缩进行渲染
  });

  test('更多菜单触发器在位（项目操作 aria + list-tree 图标），弹出对齐收尾', () => {
    const html = renderToStaticMarkup(
      <ProjectSection group={makeGroup()} ages={{}} activeSessionId="" />,
    );
    expect(html).toContain('aria-label="项目操作"');
    expect(html).toContain('lucide-list-tree');
  });

  test('hover 淡入形态：菜单打开中常驻可见（popup-open 组合），不再流内增删（症状钉子）', () => {
    const html = renderToStaticMarkup(
      <ProjectSection group={makeGroup()} ages={{}} activeSessionId="" />,
    );
    expect(html).toContain('group-has-data-[popup-open]/row:opacity-100');
    expect(html).not.toContain('group-hover/row:flex');
    expect(html).not.toContain('group-hover/row:hidden');
  });

  test('行级焦点环只随键盘聚焦出现（has(button:focus-visible)，非 focus-within 常驻）', () => {
    const html = renderToStaticMarkup(
      <ProjectSection group={makeGroup()} ages={{}} activeSessionId="" />,
    );
    expect(html).toContain('has-[button:focus-visible]:ring-3');
    expect(html).not.toContain('focus-within:ring-3');
  });

  test('行距节律：组内行同一 gap-[2px]（T17 两视图行距不一致症状钉子）', () => {
    const html = renderToStaticMarkup(
      <ProjectSection group={makeGroup()} ages={{}} activeSessionId="" />,
    );
    expect(html).toContain('flex flex-col gap-[2px]');
  });

  test('显示更多：截断组（total > visible）给入口，已展开组不给', () => {
    const truncated = renderToStaticMarkup(
      <ProjectSection group={makeGroup({ visible: [makeSession('a')], total: 3 })} ages={{}} activeSessionId="" />,
    );
    expect(truncated).toContain('显示更多');
    const complete = renderToStaticMarkup(
      <ProjectSection group={makeGroup({ visible: [makeSession('a'), makeSession('b')], total: 2 })} ages={{}} activeSessionId="" />,
    );
    expect(complete).not.toContain('显示更多');
  });
});

describe('PinnedSection（SSR）', () => {
  test('小标题 + 置顶行行首钉子形态', () => {
    const html = renderToStaticMarkup(
      <PinnedSection sessions={[makeSession('p', { title: '置顶会话' })]} ages={{ p: '1小时' }} activeSessionId="p" />,
    );
    expect(html).toContain('已置顶');
    expect(html).toContain('置顶会话');
    expect(html).toContain('lucide-pin');
    expect(html).toContain('aria-current="true"');
  });
});
