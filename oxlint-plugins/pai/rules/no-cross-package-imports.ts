import { defineRule } from '@oxlint/plugins'
import type { Context } from '@oxlint/plugins'

import { importVisitors, packageOf, WORKSPACE_MATRIX } from '../utils.ts'

// workspace 包间依赖方向：只准按矩阵向下依赖（contracts ← core、api ← infra；
// core/api 只认 contracts），ui/testkit 只认 contracts；apps 内不受限。
// 矩阵在 utils.ts，改动即修宪法。

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow workspace imports that violate the dependency whitelist matrix.',
    },
    messages: {
      matrix:
        "'{{spec}}' is not in the dependency whitelist of this package; see the matrix in oxlint-plugins/pai/utils.ts.",
    },
  },
  create,
})

function create(context: Context) {
  const allowed = WORKSPACE_MATRIX[packageOf(context.filename) ?? '']
  if (allowed === undefined) return {}
  return importVisitors((spec, node) => {
    if (!spec.startsWith('@paiapp/')) return
    if (allowed.includes(spec)) return
    context.report({ node, messageId: 'matrix', data: { spec } })
  })
}
