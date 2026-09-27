/* global __filename */
// diff（jsdiff）包虽发 CJS 产物但 package.json 带 type: module——Jest 29 的 CJS require
// 按最近 package.json 判 ESM 拒载。经 process.getBuiltinModule 取原生 createRequire
//（jest 的 createRequire 会被接管成带 moduleNameMapper 的 require，造成循环自引用），
// 原生 require(ESM)（Bun / Node ≥22.12）取回。仅测试期经 jest moduleNameMapper 生效。
const { createRequire } = process.getBuiltinModule('module');
module.exports = createRequire(__filename)('diff');
