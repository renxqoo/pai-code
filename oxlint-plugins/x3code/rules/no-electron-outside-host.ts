import { defineRule } from '@oxlint/plugins'
import type { Context } from '@oxlint/plugins'

import { importVisitors, isAppHost } from '../utils.ts'

// electron 只允许出现在宿主层（apps/electron 的 main/preload）；
// packages 与渲染层引用 electron 即越界（渲染层只能经 preload 桥）。

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow importing 'electron' outside the app host (main/preload).",
    },
    messages: {
      host:
        "'electron' is only allowed in apps/electron main/preload ('{{file}}'); the renderer must go through the preload bridge.",
    },
  },
  create,
})

function create(context: Context) {
  if (isAppHost(context.filename)) return {}
  return importVisitors((spec, node) => {
    if (spec !== 'electron') return
    context.report({ node, messageId: 'host', data: { file: context.filename } })
  })
}
