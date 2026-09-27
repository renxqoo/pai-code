/* global __filename */
// marked 只发 ESM（package.json type: module）——Jest 29 的 CJS require 拒载这类文件
// （与产物格式、babel 转换无关）。必须经 process.getBuiltinModule 取**原生** createRequire：
// jest 会把 createRequire 接管成带 moduleNameMapper 的 require，造成对本垫片的循环引用、
// 拿到空 exports。解析锚点取 react-native-marked 的入口（消费方语境，其兄弟目录必有 marked），
// 原生 require(ESM)（Bun / Node ≥22.12 支持）取回命名空间。
// 仅测试期经 jest moduleNameMapper 生效；生产（Metro）仍直接解析真实 marked。
const { createRequire } = process.getBuiltinModule('module');
const from = createRequire(__filename);
module.exports = createRequire(from.resolve('react-native-marked'))('marked');
