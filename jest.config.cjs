/** @type {import('jest').Config} */

// Jest configuration to use ts-jest to allow TypeScript Files
module.exports = {
  preset: 'ts-jest',

  testEnvironment: 'node',  // Set Test Environment to Node.js

  roots: ['<rootDir>/src', '<rootDir>/src/__tests__'],  // Specify Location of source and test files
  
  // Map TS path aliases to actual folders.
  // These must mirror `paths` in tsconfig.json — only `@/` was mapped here, so
  // any module importing via @resolvers/ or @scalars/ could not be loaded from
  // a test at all. That is why src/resolvers/resolvers.ts (the composed,
  // auth-wrapped map) had no test coverage until now.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@resolvers/(.*)$': '<rootDir>/src/resolvers/$1',
    '^@scalars/(.*)$': '<rootDir>/src/scalars/$1',
  },

  // Include all test files
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '!**/__tests__/helpers/**/*',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json',  // Use a separate tsconfig for Jest
        diagnostics: false,  // Disable TypeScript Diagnostics for faster test runs
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  
  // Collect Code Coverage
  collectCoverage: true,
  // collectCoverageFrom: [
  //   'src/**/*.{ts, tsx}',     // All TS files in src
  //   '!src/**/*.d.ts',         // Ignore Declaration Files
  //   '!src/__tests__/**',      // Ignore Test Files
  // ],
};