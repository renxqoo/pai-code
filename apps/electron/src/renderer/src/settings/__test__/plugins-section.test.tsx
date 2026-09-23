import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PluginCandidateView, PluginView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { buildPluginImportItems, PluginImportContent } from '../plugin-import-content';
import { PluginImportDialog } from '../plugin-import-dialog';
import { PluginsSection } from '../plugins-section';
import { PluginRemoveButton } from '../plugin-remove-button';

/** plugin-runtime M4 渲染冒烟（SSR：Dialog 外壳走 Portal，内容组件抽出直测——
 *  skill-import-dialog 同款范式）+ 选择集装配纯函数 + P2 审批文案在场断言。 */

const noop = (): void => undefined;
const summary = (): Promise<{ imported: number; failed: ReadonlyArray<{ name: string; reason: string }>; reopenFailures: number }> =>
  Promise.resolve({ imported: 0, failed: [], reopenFailures: 0 });

const candidate = (over: Partial<PluginCandidateView>): PluginCandidateView => ({
  name: 'demo',
  description: '',
  sourcePath: '/src/demo',
  origin: 'picked',
  state: 'ready',
  problem: null,
  ...over,
});

const plugin = (over: Partial<PluginView>): PluginView => ({
  name: 'demo',
  source: 'vendor',
  origin: 'manual',
  version: 1,
  enabled: true,
  status: 'active',
  disabledReason: null,
  description: 'a demo plugin',
  path: 'demo',
  ...over,
});

function content(props: Partial<Parameters<typeof PluginImportContent>[0]> = {}): string {
  return renderToStaticMarkup(
    <PluginImportContent
      candidates={[]}
      installedNames={[]}
      selections={new Map()}
      busy={false}
      summary={null}
      onToggleRow={noop}
      onToggleOverwrite={noop}
      onRun={noop}
      onScan={noop}
      onPickFolder={noop}
      onClose={noop}
      {...props}
    />,
  );
}

function section(props: Partial<Parameters<typeof PluginsSection>[0]> = {}): string {
  return renderToStaticMarkup(
    <PluginsSection
      list={[]}
      onToggle={() => Promise.resolve(false)}
      onRefresh={noop}
      onScanCandidates={() => Promise.resolve(null)}
      onImportPlugins={summary}
      onPickFolder={() => Promise.resolve(null)}
      onRemove={() => Promise.resolve(false)}
      {...props}
    />,
  );
}

describe('插件分区渲染冒烟（M4）', () => {
  test('分区壳：标题/搜索/导入入口；卡片带来源/状态徽章与启停开关；builtin 无移除钮', () => {
    const html = section({
      list: [
        plugin({ name: 'mine', source: 'vendor', origin: 'agent' }),
        plugin({ name: 'token-analytics', source: 'builtin', origin: null, version: null, description: null, path: null, status: 'unloaded' }),
        plugin({ name: 'old', source: 'vendor', enabled: true, status: 'disabled', disabledReason: 'plugin apiVersion 9 does not match kernel 1' }),
      ],
    });
    expect(html).toContain(copy.settings.pluginsTitle);
    expect(html).toContain(copy.settings.pluginsImportButton);
    expect(html).toContain(copy.settings.pluginSourceOptions.vendor);
    expect(html).toContain(copy.settings.pluginOriginOptions.agent);
    expect(html).toContain(copy.settings.pluginStatusOptions.active);
    expect(html).toContain(copy.settings.pluginDisabledReason('plugin apiVersion 9 does not match kernel 1'));
    expect(html).toContain(copy.settings.pluginDeleteLabel('mine'));
    expect(html).not.toContain(copy.settings.pluginDeleteLabel('token-analytics'));
  });

  test('P2 审批语义：分区 hint 明示能力授予；risk 文案键非空（对话框外壳 Portal 不能 SSR——外壳引用由 lint/typecheck 钉住）', () => {
    expect(section()).toContain(copy.settings.pluginsHint);
    expect(copy.settings.pluginsHint).toContain('授予');
    expect(copy.settings.pluginImportRisk.length).toBeGreaterThan(10);
    expect(copy.settings.pluginImportDesc.length).toBeGreaterThan(5);
  });

  test('空清单空态；搜索本地过滤（名称与描述匹配）', () => {
    expect(section()).toContain(copy.settings.pluginsEmpty);
  });
});

describe('导入面板渲染冒烟', () => {
  test('外壳关态零渲染；扫描中态；三态徽章与诊断行', () => {
    expect(renderToStaticMarkup(
      <PluginImportDialog open={false} candidates={[]} installedNames={[]} onScan={noop} onPickFolder={noop} onImport={summary} onClose={noop} />,
    )).toBe('');
    expect(content({ candidates: null })).toContain(copy.settings.pluginImportScanning);
    const html = content({
      candidates: [
        candidate({ state: 'ready' }),
        candidate({ name: 'renamed', sourcePath: '/src/other-dir', state: 'rename' }),
        candidate({ name: 'bad', state: 'blocked', problem: 'bare @x-harness/core import' }),
      ],
    });
    expect(html).toContain(copy.settings.pluginCandidateState.ready);
    expect(html).toContain(copy.settings.pluginProblemRename);
    expect(html).toContain('bare @x-harness/core import');
    expect(html).toContain(copy.settings.pluginImportRun);
  });

  test('汇总态：成功/失败明细与关闭钮', () => {
    const html = content({ summary: { imported: 1, failed: [{ name: 'x', reason: 'plugin exists' }], reopenFailures: 0 } });
    expect(html).toContain(copy.settings.pluginImportDone(1, 1));
    expect(html).toContain(copy.settings.pluginImportSummaryItem('x', 'plugin exists'));
  });
});

describe('buildPluginImportItems：选择集装配', () => {
  const rows = [
    candidate({ name: 'a', sourcePath: '/src/a' }),
    candidate({ name: 'b', sourcePath: '/src/b', state: 'blocked', problem: 'x' }),
    candidate({ name: 'c', sourcePath: '/src/c' }),
  ];
  test('blocked 恒不可选；选中项带 overwrite', () => {
    const selections = new Map([
      ['/src/a', { overwrite: false }],
      ['/src/b', { overwrite: true }],
      ['/src/c', { overwrite: true }],
    ]);
    expect(buildPluginImportItems(rows, selections)).toEqual([
      { sourcePath: '/src/a', overwrite: false },
      { sourcePath: '/src/c', overwrite: true },
    ]);
  });
  test('空选择集 → 空', () => {
    expect(buildPluginImportItems(rows, new Map())).toEqual([]);
  });
});

describe('移除钮两步确认', () => {
  test('首击只出确认态；确认文案含名', () => {
    const html = renderToStaticMarkup(<PluginRemoveButton name="mine" onRemove={() => Promise.resolve(true)} />);
    expect(html).toContain(copy.settings.pluginDeleteLabel('mine'));
    expect(html).not.toContain(copy.settings.confirmRemove);
  });
});
