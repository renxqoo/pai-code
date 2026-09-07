import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join } from 'node:path'
import type { ESTree } from '@oxlint/plugins'

// pai 插件共享：包定位（向上找最近 package.json）与 import 说明符收集。
// 规则语义与方案第 1 章依赖白名单矩阵一致；矩阵改动 = 修宪法，就近同步测试。

export const WORKSPACE_MATRIX: Record<string, readonly string[]> = {
  '@paiapp/contracts': [],
  '@paiapp/adapter': ['@paiapp/contracts'],
  '@paiapp/core': ['@paiapp/contracts'],
  '@paiapp/infra': ['@paiapp/contracts', '@paiapp/core', '@paiapp/adapter'],
  '@paiapp/api': ['@paiapp/contracts', '@paiapp/core', '@paiapp/infra', '@paiapp/adapter'],
  '@paiapp/ui': ['@paiapp/contracts'],
  '@paiapp/testkit': ['@paiapp/contracts', '@paiapp/adapter'],
}

const pkgNameCache = new Map<string, string | null>()

/** 从文件向上找最近 package.json 的 @paiapp/* 包名；非 workspace 文件返回 null。 */
export function packageOf(filename: string): string | null {
  const start = dirname(filename)
  const cached = pkgNameCache.get(start)
  if (cached !== undefined) return cached
  let result: string | null = null
  let dir = start
  for (;;) {
    try {
      const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name
      result = typeof name === 'string' && name.startsWith('@paiapp/') ? name : null
      break
    } catch {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  pkgNameCache.set(start, result)
  return result
}

/** 渲染层：apps/electron/src/renderer 子树（浏览器环境，禁 node/electron）。 */
export function isRenderer(filename: string): boolean {
  return filename.includes('/apps/electron/src/renderer/')
}

/** 宿主层：apps/electron 的 main/preload（唯一允许 electron 与 node 的地方）。 */
export function isAppHost(filename: string): boolean {
  return filename.includes('/apps/electron/src/') && !isRenderer(filename)
}

const NODE_LIKE_PREFIXES = ['node:', 'bun:']
const NODE_BUILTINS = new Set(builtinModules)

/** node/bun 内建模块判定（含无前缀的 fs、path 等裸内建名）。 */
export function isNodeLike(spec: string): boolean {
  if (NODE_LIKE_PREFIXES.some((p) => spec.startsWith(p))) return true
  return NODE_BUILTINS.has(spec.split('/')[0] ?? '')
}

/**
 * 四种 import 形态统一收集：静态 import / export-from / 动态 import()，
 * 仅字面量说明符（模板字符串拼路径不在覆盖面）。
 */
export function importVisitors(
  check: (spec: string, node: ESTree.Node) => void,
): {
  ImportDeclaration: (node: ESTree.ImportDeclaration) => void
  ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) => void
  ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) => void
  ImportExpression: (node: ESTree.ImportExpression) => void
} {
  const literal = (sourceNode: ESTree.Expression | null | undefined, node: ESTree.Node): void => {
    if (sourceNode === null || sourceNode === undefined) return
    if (sourceNode.type !== 'Literal' || typeof sourceNode.value !== 'string') return
    check(sourceNode.value, node)
  }
  return {
    ImportDeclaration: (node) => literal(node.source, node),
    ExportAllDeclaration: (node) => literal(node.source, node),
    ExportNamedDeclaration: (node) => literal(node.source, node),
    ImportExpression: (node) => literal(node.source, node),
  }
}
