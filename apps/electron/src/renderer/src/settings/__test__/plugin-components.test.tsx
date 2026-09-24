import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PluginCandidateView } from '@paiapp/contracts';
import { copy } from '@/strings';

import { PluginImportDialog } from '../plugin-import-dialog';
import { PluginRemoveButton } from '../plugin-remove-button';

/** plugin-runtime M4 组件行为面（覆盖门缺口件）：
 *  移除钮初始态渲染 + 导入对话框关态零渲染（开态内容件在 plugin-import-content
 *  直测——Dialog 外壳 SSR 走 Portal 不出内容，plugins-section.test 同款限制）。 */

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

describe('PluginRemoveButton（两步确认）', () => {
  test('初始态：图标钮（aria label 用插件名）；非确认态不含确认文案', () => {
    const markup = renderToStaticMarkup(<PluginRemoveButton name="demo" onRemove={() => Promise.resolve(true)} />);
    expect(markup).toContain(copy.settings.pluginDeleteLabel('demo'));
    expect(markup).not.toContain(copy.settings.confirmRemove);
  });
});

describe('PluginImportDialog（外壳）', () => {
  const base = {
    candidates: [candidate({})],
    installedNames: [] as string[],
    onScan: noop,
    onPickFolder: noop,
    onImport: summary,
    onClose: noop,
  };

  test('关态零渲染', () => {
    expect(renderToStaticMarkup(<PluginImportDialog {...base} open={false} />)).toBe('');
  });
});
