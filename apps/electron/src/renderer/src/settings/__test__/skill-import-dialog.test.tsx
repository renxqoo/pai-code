import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SkillCandidateView } from '@paiapp/contracts';
import { copy } from '@/strings';
import { buildImportItems, SkillImportContent, type RowSelection } from '../skill-import-content';
import { SkillImportDialog } from '../skill-import-dialog';

/** T42 M3 渲染冒烟（SSR：Base UI Dialog 外壳走 Portal，内容组件抽出后直测——
 *  provider-model-dialog 同款范式）+ 选择集装配纯函数用例。 */

const noop = (): void => undefined;
const summary = (): Promise<{ imported: number; failed: ReadonlyArray<{ name: string; reason: string }>; reopenFailures: number }> =>
  Promise.resolve({ imported: 0, failed: [], reopenFailures: 0 });

const candidate = (over: Partial<SkillCandidateView>): SkillCandidateView => ({
  name: 'bw',
  description: '',
  sourcePath: '/src/bw',
  origin: 'agents',
  state: 'ready',
  problem: null,
  ...over,
});

function content(props: Partial<Parameters<typeof SkillImportContent>[0]> = {}): string {
  return renderToStaticMarkup(
    <SkillImportContent
      candidates={[]}
      installedNames={[]}
      selections={new Map()}
      busy={false}
      summary={null}
      onToggleRow={noop}
      onRenameRow={noop}
      onToggleOverwrite={noop}
      onRun={noop}
      onScan={noop}
      onPickFolder={noop}
      onClose={noop}
      {...props}
    />,
  );
}

describe('导入面板渲染冒烟（T42 M3）', () => {
  test('外壳关态零渲染；面板带来源动作 + 运行闸', () => {
    expect(renderToStaticMarkup(
      <SkillImportDialog open={false} candidates={[]} installedNames={[]} onScan={noop} onPickFolder={noop} onImport={summary} onClose={noop} />,
    )).toBe('');
    const html = content();
    expect(html).toContain(copy.settings.skillImportPickFolder);
    expect(html).toContain(copy.settings.skillImportRescan);
    expect(html).toContain(copy.settings.skillImportRun);
    expect(html).toContain(copy.settings.skillImportClose);
  });

  test('扫描中态（candidates=null）与空态各有去向文案', () => {
    expect(content({ candidates: null })).toContain(copy.settings.skillImportScanning);
    expect(content({ candidates: [] })).toContain(copy.settings.skillImportEmpty);
  });

  test('三态徽章 + 候选诊断 + 来源徽章 + 已安装徽章', () => {
    const html = content({
      candidates: [
        candidate({}),
        candidate({ name: 'tavily-cli', sourcePath: '/src/tavily', state: 'rename', problem: 'name_mismatch' }),
        candidate({ name: 'demo-orders', sourcePath: '/src/demo-orders', state: 'blocked', problem: 'frontmatter_not_flat' }),
      ],
      installedNames: ['bw'],
    });
    for (const state of ['ready', 'rename', 'blocked'] as const) {
      expect(html).toContain(copy.settings.skillCandidateState[state]);
    }
    expect(html).toContain(copy.settings.skillOrigin.agents);
    expect(html).toContain(copy.settings.skillProblem.name_mismatch);
    expect(html).toContain(copy.settings.skillProblem.frontmatter_not_flat);
    expect(html).toContain(copy.settings.skillImportExists);
  });

  test('选中行：目标名输入 + 改名提示 + 覆盖同名确认（冲突行显式勾选）', () => {
    const selections = new Map<string, RowSelection>([
      ['/src/bw', { name: 'bw', overwrite: false }],
      ['/src/tavily', { name: 'tavily-tool', overwrite: true }],
    ]);
    const html = content({
      candidates: [candidate({}), candidate({ name: 'tavily-cli', sourcePath: '/src/tavily', state: 'rename', problem: 'name_mismatch' })],
      installedNames: ['bw'],
      selections,
    });
    expect(html).toContain(copy.settings.skillImportNameLabel('bw'));
    expect(html).toContain(copy.settings.skillImportRenameTo('tavily-cli', 'tavily-tool'));
    expect(html).toContain(copy.settings.skillImportOverwrite);
  });

  test('目标名不过围栏：行内错误 + 运行闸关闭', () => {
    const selections = new Map<string, RowSelection>([['/src/bw', { name: '../x', overwrite: false }]]);
    const html = content({ candidates: [candidate({})], selections });
    expect(html).toContain(copy.settings.skillImportNameInvalid);
    expect(html).toContain('disabled');
  });

  test('busy：运行中态文案；汇总视图含逐条失败明细', () => {
    expect(content({ busy: true })).toContain(copy.settings.skillImportRunning);
    const done = content({
      summary: { imported: 2, failed: [{ name: 'demo-orders', reason: '技能无法解析' }], reopenFailures: 0 },
    });
    expect(done).toContain(copy.settings.skillImportDone(2, 1));
    expect(done).toContain(copy.settings.skillImportSummaryItem('demo-orders', '技能无法解析'));
    expect(done).toContain(copy.settings.skillImportDoneNone === '' ? '' : copy.settings.skillImportClose);
  });

  test('空汇总（零导入零失败）落「未导入」文案', () => {
    const done = content({ summary: { imported: 0, failed: [], reopenFailures: 0 } });
    expect(done).toContain(copy.settings.skillImportDoneNone);
  });
});

describe('选择集装配（buildImportItems）', () => {
  test('选中行 → 请求（改名才带 name；blocked 不入选）', () => {
    const candidates = [
      candidate({}),
      candidate({ name: 'tavily-cli', sourcePath: '/src/tavily', state: 'rename', problem: 'name_mismatch' }),
      candidate({ name: 'demo-orders', sourcePath: '/src/demo-orders', state: 'blocked', problem: 'frontmatter_not_flat' }),
    ];
    const items = buildImportItems(candidates, new Map([
      ['/src/bw', { name: 'bw', overwrite: false }],
      ['/src/tavily', { name: 'tavily-tool', overwrite: true }],
      ['/src/demo-orders', { name: 'demo-orders', overwrite: false }],
    ]));
    expect(items).toEqual([
      { sourcePath: '/src/bw', name: undefined, overwrite: false },
      { sourcePath: '/src/tavily', name: 'tavily-tool', overwrite: true },
    ]);
  });

  test('未选中行不产出请求；空选择集 = 空表', () => {
    expect(buildImportItems([candidate({})], new Map())).toEqual([]);
    expect(buildImportItems([], new Map([['/src/bw', { name: 'bw', overwrite: false }]]))).toEqual([]);
  });
});
