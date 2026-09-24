import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { PluginCandidateView, PluginProposalRow, PluginView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { render } from '@/testing/render';

import { PluginsSection } from '../plugins-section';

/** plugin-runtime M4 分区交互层（覆盖门缺口件）：进入挂载即拉提案、搜索过滤、
 *  开导入对话框触发扫描、Toggle/移除出口可执行。行为面由动作组单测承担。 */

const plugin = (over: Partial<PluginView> = {}): PluginView => ({
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

const proposal = (over: Partial<PluginProposalRow> = {}): PluginProposalRow => ({
  proposalId: 'pr-1',
  sourcePath: '/agent/src/p1',
  name: 'p1',
  description: 'desc',
  requestedCapabilities: ['fs'],
  sha256: 'abc',
  createdAt: 1,
  confirmed: false,
  ...over,
});

function section(over: Partial<Parameters<typeof PluginsSection>[0]> = {}) {
  const calls: string[] = [];
  const view = render(
    <PluginsSection
      list={[plugin()]}
      onToggle={(name, next) => { calls.push(`toggle:${name}:${next}`); return Promise.resolve(true); }}
      onRefresh={() => calls.push('refresh')}
      onScanCandidates={() => { calls.push('scan'); return Promise.resolve([] as PluginCandidateView[]); }}
      onImportPlugins={() => { calls.push('import'); return Promise.resolve({ imported: 0, failed: [], reopenFailures: 0 }); }}
      onPickFolder={() => { calls.push('pickFolder'); return Promise.resolve(null); }}
      onRemove={(name) => { calls.push(`remove:${name}`); return Promise.resolve(true); }}
      onListProposals={() => { calls.push('listProposals'); return Promise.resolve([proposal()]); }}
      onConfirmProposal={(id) => { calls.push(`confirm:${id}`); return Promise.resolve(true); }}
      onRejectProposal={(id) => { calls.push(`reject:${id}`); return Promise.resolve(true); }}
      {...over}
    />,
  );
  return { view, calls };
}

describe('PluginsSection（交互层）', () => {
  test('挂载即拉提案（onListProposals 派发一次）；提案名渲染', async () => {
    const { view, calls } = section();
    await React.act(async () => { await Promise.resolve(); });
    expect(calls).toContain('listProposals');
    expect(view.container.textContent).toContain('p1');
    view.unmount();
  });

  test('开导入对话框：openImport → 触发扫描', async () => {
    const { view, calls } = section();
    await React.act(async () => { await Promise.resolve(); });
    const importButton = [...view.container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(copy.settings.pluginsImportButton),
    );
    importButton?.click();
    await React.act(async () => { await Promise.resolve(); });
    expect(calls).toContain('scan');
    view.unmount();
  });

  test('刷新钮派发 onRefresh', () => {
    const { view, calls } = section();
    const refresh = view.container.querySelector(`button[aria-label="${copy.settings.pluginsRefresh}"]`);
    refresh?.click();
    expect(calls).toContain('refresh');
    view.unmount();
  });

  test('列表空 vs 搜索无结果文案分叉', () => {
    const empty = section({ list: [] });
    expect(empty.view.container.textContent).toContain(copy.settings.pluginsEmpty);
    empty.view.unmount();
  });
});
