import { expect, test } from 'bun:test';

import { resolveResourceSources } from '../sync-resources';

/** 资源来源解析回归：env 覆盖优先、缺省走旁级 pi 检出产物路径。 */

test('env 覆盖优先于缺省来源', () => {
  const sources = resolveResourceSources(
    { PAI_BUN_PATH: '/custom/bun', PAI_HUB_ENTRY: '/custom/cli.js' },
    '/repo',
    '/exec/bun',
  );
  expect(sources).toEqual({ bunPath: '/custom/bun', hubEntry: '/custom/cli.js' });
});

test('缺省：本机 bun 与旁级 pi/app/dist/cli.js', () => {
  const sources = resolveResourceSources({}, '/repo', '/exec/bun');
  expect(sources).toEqual({ bunPath: '/exec/bun', hubEntry: '/pi/app/dist/cli.js' });
});
