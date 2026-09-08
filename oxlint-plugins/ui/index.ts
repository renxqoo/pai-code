import { definePlugin } from '@oxlint/plugins'

import noMultiComponent from './rules/no-multi-component.ts'

// 插件 ui：渲染层组件纪律（一个文件夹一个插件，入口固定 index.ts，
// 由根 .oxlintrc.json 的 jsPlugins 指向；规则放 rules/，一条规则一个文件，
// 与就近的 <rule>.test.ts 配套；新增规则在本文件注册一行即可）。
export default definePlugin({
  meta: {
    name: 'ui',
  },
  rules: {
    'no-multi-component': noMultiComponent,
  },
})
