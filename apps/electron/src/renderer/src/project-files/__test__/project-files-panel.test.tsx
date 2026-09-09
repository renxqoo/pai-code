import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProjectFileNode } from '../../sidebar/build-file-tree';
import { ProjectFilesPanel, type ProjectFilesPanelProps } from '../project-files-panel';

/**
 * 渲染冒烟：经 react-dom/server 渲染侧栏内嵌项目文件面板，锁定返回行（返回钮/项目名/路径）、
 * 搜索框、树的深度缩进与目录默认折叠态、loading 与空态文案产出预期 DOM。
 * 交互（展开/搜索输入/返回，Esc）由装配层与全局 Esc 链覆盖，这里只锁渲染形态。
 */
function makeNode(
  overrides: Partial<ProjectFileNode> & Pick<ProjectFileNode, 'name' | 'path' | 'kind'>,
): ProjectFileNode {
  return { children: [], ...overrides };
}

const sampleTree: readonly ProjectFileNode[] = [
  makeNode({
    name: 'src',
    path: 'src',
    kind: 'dir',
    children: [
      makeNode({ name: 'main.ts', path: 'src/main.ts', kind: 'file' }),
      makeNode({
        name: 'app',
        path: 'src/app',
        kind: 'dir',
        children: [makeNode({ name: 'index.tsx', path: 'src/app/index.tsx', kind: 'file' })],
      }),
    ],
  }),
  makeNode({ name: 'README.md', path: 'README.md', kind: 'file' }),
  makeNode({ name: 'package.json', path: 'package.json', kind: 'file' }),
];

function noop(): void {}

function makeProps(overrides: Partial<ProjectFilesPanelProps> = {}): ProjectFilesPanelProps {
  return {
    projectName: 'pai',
    projectPath: '/tmp/pai',
    tree: sampleTree,
    loading: false,
    onClose: noop,
    ...overrides,
  };
}

describe('ProjectFilesPanel 渲染冒烟', () => {
  test('返回行在位：返回钮（aria-label 关闭）、项目名与 mono 路径', () => {
    const html = renderToStaticMarkup(<ProjectFilesPanel {...makeProps()} />);
    expect(html).toContain('aria-label="关闭"');
    expect(html).toContain('>pai</p>');
    expect(html).toContain('/tmp/pai');
  });

  test('搜索框在位：放大镜旁的文本输入（侧栏同宽一行）', () => {
    const html = renderToStaticMarkup(<ProjectFilesPanel {...makeProps()} />);
    expect(html).toContain('<input');
    expect(html).toContain('placeholder="搜索"');
  });

  test('树按深度缩进渲染；默认只展开第一层目录；目录在前文件在后', () => {
    const html = renderToStaticMarkup(<ProjectFilesPanel {...makeProps()} />);
    expect(html).toContain('padding-left:8px');
    expect(html).toContain('padding-left:22px');
    expect(html).not.toContain('padding-left:36px');
    expect(html).toContain('main.ts');
    expect(html).not.toContain('index.tsx');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
    const srcIndex = html.indexOf('>src</span>');
    const readmeIndex = html.indexOf('README.md');
    expect(srcIndex).toBeGreaterThanOrEqual(0);
    expect(readmeIndex).toBeGreaterThan(srcIndex);
  });

  test('loading 态：树区只显示加载文案，不渲染树', () => {
    const html = renderToStaticMarkup(<ProjectFilesPanel {...makeProps({ loading: true })} />);
    expect(html).toContain('正在读取项目文件…');
    expect(html).not.toContain('package.json');
    expect(html).not.toContain('padding-left:');
  });

  test('空态：loading 结束且树为空时显示空态文案', () => {
    const html = renderToStaticMarkup(<ProjectFilesPanel {...makeProps({ tree: [] })} />);
    expect(html).toContain('没有可展示的文件');
    expect(html).not.toContain('padding-left:');
  });
});
