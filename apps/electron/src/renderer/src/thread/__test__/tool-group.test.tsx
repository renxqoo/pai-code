import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ToolGroup } from '../tool-group';
import { ToolGroupHeader } from '../tool-group-header';
import { ToolsBlock } from '../tools-block';
import { toolGroupIcon } from '../tool-group-icon';
import type { ToolCallModel } from '../thread-model';

function call(name: string, overrides: Partial<ToolCallModel> = {}): ToolCallModel {
  return {
    id: `${name}-1`,
    name,
    argsPreview: `${name} 参数`,
    subagents: [],
    editHunks: [],
    output: '',
    exitCode: 0,
    durationMs: 10,
    status: 'ok',
    ...overrides,
  };
}

describe('ToolGroup 并行批次组头（用户指定形态）', () => {
  test('收起态：只渲染组头，调用行不进 DOM', () => {
    const html = renderToStaticMarkup(
      <ToolGroup calls={[call('bash', { id: 'a' }), call('edit', { id: 'b' })]} />,
    );
    expect(html).toContain('编辑了文件运行了命令');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('bash 参数');
    expect(html).not.toContain('edit 参数');
  });

  test('组头与工具行同为灰色（弱化灰，非正文前景色）', () => {
    const html = renderToStaticMarkup(
      <ToolGroupHeader calls={[call('edit'), call('edit', { id: 'e2' })]} open onToggle={() => undefined} />,
    );
    expect(html).toContain('text-muted-foreground');
    expect(html).not.toContain('text-foreground/75');
  });

  test('收起态箭头 hover 才显形；展开态常显（用户裁决 2）', () => {
    const closed = renderToStaticMarkup(
      <ToolGroupHeader calls={[call('read'), call('read', { id: 'r2' })]} open={false} onToggle={() => undefined} />,
    );
    expect(closed).toContain('opacity-0');
    expect(closed).toContain('group-hover:opacity-70');
    const opened = renderToStaticMarkup(
      <ToolGroupHeader calls={[call('read'), call('read', { id: 'r2' })]} open onToggle={() => undefined} />,
    );
    expect(opened).not.toContain('opacity-0');
    expect(opened).toContain('opacity-70');
  });

  test('组头标题不带计数（用户裁决：去掉 x 个文件的数字）', () => {
    const html = renderToStaticMarkup(
      <ToolGroupHeader
        calls={[call('read'), call('read', { id: 'r2' }), call('read', { id: 'r3' })]}
        open
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain('阅读了文件');
    expect(html).not.toContain('3 个文件');
  });

  test('运行中批次：标题走波纹加载态', () => {
    const html = renderToStaticMarkup(
      <ToolGroupHeader
        calls={[call('bash', { status: 'running' }), call('edit', { status: 'running' })]}
        open
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain('shimmer-text');
  });

  test('症状回归：组头图标不吃 shimmer（文字技法作用在 SVG 上会让描边消失）', () => {
    const html = renderToStaticMarkup(
      <ToolGroupHeader
        calls={[call('read', { status: 'running' }), call('read', { id: 'r2', status: 'running' })]}
        open
        onToggle={() => undefined}
      />,
    );
    const icon = html.match(/<svg[^>]*class="([^"]*)"/)?.[1] ?? '';
    expect(icon).not.toBe('');
    expect(icon).not.toContain('shimmer-text');
  });

  test('批次内有失败：组头自动展开（错误必须看得见）', () => {
    const html = renderToStaticMarkup(
      <ToolGroup calls={[call('bash', { id: 'a' }), call('edit', { id: 'b', status: 'failed', exitCode: 1 })]} />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('edit 参数');
  });

  test('单调用不套组头：直接一个执行单元行（带类别图标 + 状态前缀）', () => {
    const html = renderToStaticMarkup(<ToolsBlock calls={[call('bash', { status: 'ok' })]} />);
    expect(html).toContain('bash 参数');
    expect(html).toContain('已运行');
    expect(html).toContain('lucide-square-terminal');
    expect(html).not.toContain('aria-expanded');
  });

  test('空批次不渲染任何内容', () => {
    expect(renderToStaticMarkup(<ToolsBlock calls={[]} />)).toBe('');
  });
});

describe('组头图标按类别语义选取（用户裁决：edit 铅笔 / 全阅读书 / 全命令终端 / 其余扳手）', () => {
  const iconName = (html: string): string => html.match(/lucide-([a-z-]+)/)?.[1] ?? '';

  test('全编辑 → 铅笔', () => {
    expect(iconName(renderToStaticMarkup(<ToolsBlock calls={[call('edit'), call('write', { id: 'w' })]} />))).toBe('pencil');
  });

  test('全阅读 → 书', () => {
    expect(iconName(renderToStaticMarkup(<ToolsBlock calls={[call('read'), call('read', { id: 'r' })]} />))).toBe('book-open');
  });

  test('全命令 → 终端', () => {
    expect(iconName(renderToStaticMarkup(<ToolsBlock calls={[call('bash'), call('bash', { id: 'b' })]} />))).toBe('square-terminal');
  });

  test('混合类别 → 扳手；搜索类同样落扳手', () => {
    expect(iconName(renderToStaticMarkup(<ToolsBlock calls={[call('edit'), call('bash', { id: 'b' })]} />))).toBe('wrench');
    expect(toolGroupIcon([call('grep'), call('grep', { id: 'g' })])).toBeDefined();
  });

  test('图标带工具执行组无障碍名', () => {
    const html = renderToStaticMarkup(<ToolsBlock calls={[call('read'), call('read', { id: 'r' })]} />);
    expect(html).toContain('工具执行组');
  });
});
