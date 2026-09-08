import { defineRule } from '@oxlint/plugins'
import type { Context } from '@oxlint/plugins'

import { importVisitors, isNodeLike, isRenderer, packageOf } from '../utils.ts'

// 浏览器环境面禁 node/bun：contracts 与 ui 必须环境无关（bun test 零 mock 直测、
// 未来任意宿主复用），renderer 只能经 preload 桥拿系统能力。

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow node/bun builtin imports in environment-free packages and the renderer.',
    },
    messages: {
      browser:
        "'{{spec}}' is a node/bun builtin; contracts, ui and the renderer must stay environment-free (use a Port).",
    },
  },
  create,
})

function create(context: Context) {
  const pkg = packageOf(context.filename)
  const inBrowserZone = pkg === '@paiapp/contracts' || pkg === '@paiapp/ui' || isRenderer(context.filename)
  if (!inBrowserZone) return {}
  const isTestFile = context.filename.includes('/__test__/')
  return importVisitors((spec, node) => {
    if (spec === 'bun:test' && isTestFile) return
    if (!isNodeLike(spec)) return
    context.report({ node, messageId: 'browser', data: { spec } })
  })
}
