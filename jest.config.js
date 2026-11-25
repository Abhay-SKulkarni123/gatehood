const { passWithNoTests, ...expoProjectPreset } = require('jest-expo/jest-preset');

const sourceMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
};

module.exports = {
  passWithNoTests,
  projects: [
    {
      ...expoProjectPreset,
      displayName: 'app',
      rootDir: __dirname,
      moduleNameMapper: {
        ...expoProjectPreset.moduleNameMapper,
        ...sourceMapper,
      },
      testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
      testPathIgnorePatterns: ['<rootDir>/__tests__/membership-provider.test.tsx'],
    },
    {
      displayName: 'provider',
      rootDir: __dirname,
      testEnvironment: 'jsdom',
      transform: expoProjectPreset.transform,
      transformIgnorePatterns: expoProjectPreset.transformIgnorePatterns,
      moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
      moduleNameMapper: {
        ...expoProjectPreset.moduleNameMapper,
        ...sourceMapper,
      },
      testMatch: ['**/__tests__/membership-provider.test.tsx'],
      setupFiles: [],
    },
  ],
};
