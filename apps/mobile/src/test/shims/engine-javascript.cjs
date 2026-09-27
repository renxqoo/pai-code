/* global __filename */
// @shikijs/engine-javascript 只发 ESM（type: module）——同 marked-shim.cjs 机制：原生 require(ESM) 取回。仅测试期经 moduleNameMapper 生效。
const { createRequire } = process.getBuiltinModule('module');
module.exports = createRequire(__filename)('@shikijs/engine-javascript');
