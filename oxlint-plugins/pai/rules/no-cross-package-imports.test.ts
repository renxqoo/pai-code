import { describe, expect, test } from 'bun:test'

import { lintTree, MINI_TREE, ruleCount } from '../test/utils.ts'

describe('pai/no-cross-package-imports', () => {
  test('ui 越层 import core：报', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/ui/src/u.ts': "import type {} from '@paiapp/core';\nexport {};\n" },
      'packages/ui/src/u.ts',
    )
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(1)
    expect(stdout).toContain('dependency whitelist')
  })

  test('动态 import 越层：报（AST 覆盖逃逸形态）', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/ui/src/d.ts': "const m = await import('@paiapp/core');\nexport const x = m;\n" },
      'packages/ui/src/d.ts',
    )
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(1)
  })

  test('export-from 越层：报', () => {
    const { stdout } = lintTree(
      { ...MINI_TREE, 'packages/testkit/src/e.ts': "export {} from '@paiapp/core';\n" },
      'packages/testkit/src/e.ts',
    )
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(1)
  })

  test('矩阵内依赖（core→contracts）：合法', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/core/src/ok.ts': "import type {} from '@paiapp/contracts';\nexport {};\n" },
      'packages/core/src/ok.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(0)
  })

  test('contracts 零 workspace 依赖：import contracts 也报', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/contracts/src/c.ts': "import type {} from '@paiapp/contracts';\nexport {};\n" },
      'packages/contracts/src/c.ts',
    )
    expect(exitCode).toBe(1)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(1)
  })

  test('apps 内不受矩阵约束：renderer 引 ui 合法', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'apps/electron/src/renderer/src/u.tsx': "import type {} from '@paiapp/ui';\nexport {};\n" },
      'apps/electron/src/renderer/src/u.tsx',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(0)
  })
})

describe('pai/no-cross-package-imports · adapter 矩阵（T10 修宪）', () => {
  test('adapter → contracts：合法', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/adapter/src/a.ts': "import type {} from '@paiapp/contracts';\nexport {};\n" },
      'packages/adapter/src/a.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(0)
  })

  test('adapter → infra（越层向上）：报', () => {
    const { stdout } = lintTree(
      { ...MINI_TREE, 'packages/adapter/src/b.ts': "import type {} from '@paiapp/infra';\nexport {};\n" },
      'packages/adapter/src/b.ts',
    )
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(1)
  })

  test('infra → adapter：合法（host 进程用帧解码）', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/infra/src/h.ts': "import type {} from '@paiapp/adapter';\nexport {};\n" },
      'packages/infra/src/h.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(0)
  })

  test('testkit → adapter：合法（fake-hub/夹具共用）', () => {
    const { exitCode, stdout } = lintTree(
      { ...MINI_TREE, 'packages/testkit/src/f.ts': "import type {} from '@paiapp/adapter';\nexport {};\n" },
      'packages/testkit/src/f.ts',
    )
    expect(exitCode).toBe(0)
    expect(ruleCount(stdout, 'no-cross-package-imports')).toBe(0)
  })
})
