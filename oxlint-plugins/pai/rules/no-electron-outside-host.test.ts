import { describe, expect, test } from 'bun:test'

import { lintTree, MINI_TREE, ruleCount } from '../test/utils.ts'

describe('pai/no-electron-outside-host', () => {
  test('packages 引 electron：报', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/core/src/e.ts': "import { app } from 'electron';\nexport const x = app;\n" },
      'packages/core/src/e.ts',
    )
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-electron-outside-host')).toBe(1)
  })

  test('renderer 引 electron：报（只能走 preload 桥）', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'apps/electron/src/renderer/src/e.tsx': "import { app } from 'electron';\nexport const x = app;\n" },
      'apps/electron/src/renderer/src/e.tsx',
    )
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-electron-outside-host')).toBe(1)
  })

  test('main/preload 引 electron：合法', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'apps/electron/src/main/e.ts': "import { app } from 'electron';\nexport const x = app;\n" },
      'apps/electron/src/main/e.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-electron-outside-host')).toBe(0)
  })

  test('动态 import 形态同样被拦截', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/core/src/d.ts': "const e = await import('electron');\nexport const x = e;\n" },
      'packages/core/src/d.ts',
    )
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-electron-outside-host')).toBe(1)
  })
})
