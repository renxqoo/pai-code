import { describe, expect, test } from 'bun:test'

import { lintTree, MINI_TREE, ruleCount } from '../test/utils.ts'

describe('pai/no-node-in-browser-code', () => {
  test.each([
    ['contracts 引 node:path', 'packages/contracts/src/n.ts', "import { join } from 'node:path';\nexport const j = join;\n"],
    ['contracts 引 bun:sqlite', 'packages/contracts/src/b.ts', "import {} from 'bun:sqlite';\nexport {};\n"],
    ['ui 动态引 node:fs', 'packages/ui/src/d.ts', "const fs = await import('node:fs');\nexport const x = fs;\n"],
    ['renderer 引 node:path', 'apps/electron/src/renderer/src/n.ts', "import { join } from 'node:path';\nexport const j = join;\n"],
    ['ui 引裸内建 fs', 'packages/ui/src/f.ts', "import { readFileSync } from 'fs';\nexport const r = readFileSync;\n"],
  ])('%s：报', (_name, file, content) => {
    const { exitCode, stdout } = lintTree({ ...MINI_TREE, [file]: content }, file)
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-node-in-browser-code')).toBe(1)
  })

  test('export-from 形态：报', () => {
    const { stdout } = lintTree(
      { ...MINI_TREE, 'packages/contracts/src/e.ts': "export {} from 'node:path';\n" },
      'packages/contracts/src/e.ts',
    )
    expect(ruleCount(stdout, 'no-node-in-browser-code')).toBe(1)
  })

  test('core 引 node:path：合法（Node 环境包）', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/core/src/n.ts': "import { join } from 'node:path';\nexport const j = join;\n" },
      'packages/core/src/n.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-node-in-browser-code')).toBe(0)
  })

  test('main 引 node:child_process：合法', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'apps/electron/src/main/n.ts': "import { spawn } from 'node:child_process';\nexport const s = spawn;\n" },
      'apps/electron/src/main/n.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-node-in-browser-code')).toBe(0)
  })

  test('__test__ 引 bun:test 豁免（测试运行器不是环境能力）', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/contracts/src/__test__/a.test.ts': "import { test } from 'bun:test';\ntest('x', () => {});\n" },
      'packages/contracts/src/__test__/a.test.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-node-in-browser-code')).toBe(0)
  })

  test('__test__ 引 node:path 仍报（豁免仅限测试运行器）', () => {
    const { stdout } = lintTree(
      { ...MINI_TREE, 'packages/contracts/src/__test__/n.test.ts': "import { join } from 'node:path';\nexport const j = join;\n" },
      'packages/contracts/src/__test__/n.test.ts',
    )
    expect(ruleCount(stdout, 'no-node-in-browser-code')).toBe(1)
  })
})
