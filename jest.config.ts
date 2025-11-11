import type { Config } from 'jest';

// Jest configuration to use ts-jest to allow TypeScript Files
const config: Config = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src', '<rootDir>/src/__tests__'],  // Specify Location of source and test files
  
  // Map TS path aliases to actual folders
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Include all test files
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '!**/__tests__/helpers/**/*',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
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

export default config;