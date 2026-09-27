/* global __filename */
// github-slugger 只发 ESM（package.json type: module）——同 marked-shim.cjs 的机制：
// 经 process.getBuiltinModule 取原生 createRequire（jest 的 createRequire 会被接管成
// 带 moduleNameMapper 的 require，造成循环自引用），解析锚点取 react-native-marked
// 入口（消费方语境），原生 require(ESM) 取回。仅测试期经 jest moduleNameMapper 生效。
const { createRequire } = process.getBuiltinModule('module');
const from = createRequire(__filename);
module.exports = createRequire(from.resolve('react-native-marked'))('github-slugger');
