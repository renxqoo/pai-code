export default {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/jest-setup.ts'],
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/../../node_modules/.bun/lucide-react-native@1.48.0+9223a27d1052a3bf/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(\\.bun/)?((jest-)?react-native|@react-native[^/]*|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-worklets|react-native-gesture-handler|react-native-safe-area-context|@testing-library/react-native|lucide-react-native))',
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
