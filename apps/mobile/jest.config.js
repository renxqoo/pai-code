export default {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/jest-setup.ts'],
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/../../node_modules/.bun/lucide-react-native@1.48.0+9223a27d1052a3bf/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    // marked 只发 ESM（type: module，Jest 29 CJS require 拒载）：走原生 require(ESM) 垫片（见 marked-shim.cjs）
    '^marked$': '<rootDir>/src/test/marked-shim.cjs',
    '^github-slugger$': '<rootDir>/src/test/github-slugger-shim.cjs',
    // diff（jsdiff）包 type: module 触发 Jest 拒载——同 marked 垫片机制
    '^diff$': '<rootDir>/src/test/diff-shim.cjs',
    // shiki 系只发 ESM——同 marked 垫片机制（语言/主题按名映射到对应垫片）
    '^shiki/core$': '<rootDir>/src/test/shims/shiki-core.cjs',
    '^@shikijs/engine-javascript$': '<rootDir>/src/test/shims/engine-javascript.cjs',
    '^@shikijs/themes/(.*)$': '<rootDir>/src/test/shims/theme-$1.cjs',
    '^@shikijs/langs/(.*)$': '<rootDir>/src/test/shims/lang-$1.cjs',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(\\.bun/)?((jest-)?react-native|@react-native[^/]*|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-worklets|react-native-gesture-handler|react-native-safe-area-context|@testing-library/react-native|lucide-react-native|@jsamr[^/]*|github-slugger|html-entities|svg-parser))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!**/__tests__/**'],
  coverageThreshold: {
    global: {
      statements: 90,
      lines: 90,
      functions: 90,
      branches: 85,
    },
  },
};
