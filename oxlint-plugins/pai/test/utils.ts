import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// pai 插件测试 harness：系统临时目录拼最小 workspace 树，
// 用真实 oxlint + 本插件 lint 指定文件，断言完即清理；仓库内不落违规样本。
// 经当前运行时（process.execPath）执行 oxlint 的 dist/cli.js——.bin shim 的
// shebang 是 node，直接调 shim 会引入「PATH 必须有 node」的隐藏环境依赖。
const pluginDir = join(import.meta.dirname, '..')
const oxlintCli = join(pluginDir, '../../node_modules/oxlint/dist/cli.js')

export interface LintResult {
  exitCode: number | null
  stdout: string
}

export function lintTree(files: Record<string, string>, lintTarget: string): LintResult {
  const root = mkdtempSync(join(tmpdir(), 'pai-oxlint-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(root, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content)
    }
    for (const [dir, name] of [
      ['packages/contracts', '@paiapp/contracts'],
      ['packages/core', '@paiapp/core'],
      ['packages/infra', '@paiapp/infra'],
      ['packages/api', '@paiapp/api'],
      ['packages/ui', '@paiapp/ui'],
      ['packages/testkit', '@paiapp/testkit'],
      ['apps/electron', '@paiapp/electron'],
    ] as const) {
      mkdirSync(join(root, dir), { recursive: true })
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name }))
    }
    writeFileSync(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        jsPlugins: [join(pluginDir, 'index.ts')],
        rules: {
          'pai/no-electron-outside-host': 'error',
          'pai/no-cross-package-imports': 'error',
          'pai/no-node-in-browser-code': 'error',
        },
      }),
    )
    const proc = spawnSync(process.execPath, [oxlintCli, '-c', '.oxlintrc.json', lintTarget], {
      cwd: root,
      encoding: 'utf8',
    })
    return { exitCode: proc.status, stdout: proc.stdout }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export function ruleCount(stdout: string, rule: string): number {
  return stdout.split(`pai(${rule})`).length - 1
}

/** 基础合规树：各分区各一个干净文件。 */
export const MINI_TREE: Record<string, string> = {
  'packages/contracts/src/a.ts': "import { z } from 'zod';\nexport const x = z;\n",
  'packages/core/src/a.ts': "import type {} from '@paiapp/contracts';\nexport {};\n",
  'packages/ui/src/a.ts': "import type {} from '@paiapp/contracts';\nexport {};\n",
  'apps/electron/src/main/a.ts': "import { join } from 'node:path';\nexport const j = join;\n",
  'apps/electron/src/renderer/src/a.tsx': "import type {} from '@paiapp/ui';\nexport {};\n",
}
