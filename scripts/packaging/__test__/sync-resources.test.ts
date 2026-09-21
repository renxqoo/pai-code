import { expect, test } from 'bun:test';

import { resolveResourceSources } from '../sync-resources';

/** 资源来源解析回归：env 覆盖优先、缺省走旁级 x-harness 检出源码入口（编译输入）。 */

test('env 覆盖优先于缺省来源', () => {
  const sources = resolveResourceSources(
    { PAI_BUN_PATH: '/custom/bun', PAI_HUB_ENTRY: '/custom/host/cli.ts' },
    '/repo',
    '/exec/bun',
  );
  expect(sources).toEqual({ bunPath: '/custom/bun', hubSource: '/custom/host/cli.ts' });
});

test('缺省：本机 bun 与旁级 x-harness host-hub 源码入口', () => {
  const sources = resolveResourceSources({}, '/repo', '/exec/bun');
  expect(sources).toEqual({
    bunPath: '/exec/bun',
    hubSource: '/x-harness/apps/host-hub/src/host/cli.ts',
  });
});
