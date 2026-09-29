export default {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/jest-setup.ts'],
  // workspace TS 源（packages/contracts 等）经 babel transform 后 require 的
  // @babel/runtime helper 从源文件目录向上 resolve 不到（根 node_modules 未装、
  // mobile 局部安装够不着）——显式纳入本包 node_modules 搜索路径
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/../../node_modules/.bun/lucide-react-native@1.48.0+9223a27d1052a3bf/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    // marked 只发 ESM（type: module，Jest 29 CJS require 拒载）：走原生 require(ESM) 垫片（见 marked-shim.cjs）
    '^marked$': '<rootDir>/src/test/marked-shim.cjs',
    '^github-slugger$': '<rootDir>/src/test/github-slugger-shim.cjs',
    // diff（jsdiff）包 type: module 触发 Jest 拒载——同 marked 垫片机制
    '^diff$': '<rootDir>/src/test/diff-shim.cjs',
    // relay-protocol 的 crypto 模块（@noble 纯 ESM——Jest 29 CJS 拒载）：jest 用确定性
    // 替身（协议逻辑测试）；真加密等价性由 bun 侧 wire-parity（RFC 向量对拍）背书
    // relay-protocol 的 crypto（@noble 纯 ESM——Jest 29 CJS 拒载）：按解析后的绝对路径
    // 映射到确定性替身（协议逻辑测试）；真加密等价性由 bun 侧 wire-parity 背书
    '^@paiapp/relay-protocol$': '<rootDir>/src/test/relay-protocol-jest.ts',
    // relay-protocol 内部的 ./crypto 相对引用（真 noble——Jest 拒载）：替身接管
    '^\\./crypto\\.ts$': '<rootDir>/src/test/relay-crypto-stub.ts',
    // shiki 系只发 ESM——同 marked 垫片机制（语言/主题按名映射到对应垫片）
    '^shiki/core$': '<rootDir>/src/test/shims/shiki-core.cjs',
    '^@shikijs/engine-javascript$': '<rootDir>/src/test/shims/engine-javascript.cjs',
    '^@shikijs/themes/(.*)$': '<rootDir>/src/test/shims/theme-$1.cjs',
    '^@shikijs/langs/(.*)$': '<rootDir>/src/test/shims/lang-$1.cjs',
  },
  transformIgnorePatterns: [
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!**/__tests__/**'],
};
