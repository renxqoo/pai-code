import { definePlugin } from '@oxlint/plugins'

import noCrossPackageImports from './rules/no-cross-package-imports.ts'
import noElectronOutsideHost from './rules/no-electron-outside-host.ts'
import noNodeInBrowserCode from './rules/no-node-in-browser-code.ts'

// 插件 pai：依赖白名单矩阵与环境面纪律（方案第 1 章）。
// 作用域由包定位与路径判定（packages/* 的 package.json、renderer/main 分区），
// 无需配置；新增 workspace 包必须在 utils.ts 矩阵登记，否则零约束。
export default definePlugin({
  meta: {
    name: 'pai',
  },
  rules: {
    'no-electron-outside-host': noElectronOutsideHost,
    'no-cross-package-imports': noCrossPackageImports,
    'no-node-in-browser-code': noNodeInBrowserCode,
  },
})
