import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  watchman: false,
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Tests read the package source, never a stale dist; its NodeNext
    // imports name `.js` files that exist as `.ts` in src.
    '^@repo/constants$': '<rootDir>/../../packages/constants/src/index.ts',
    '^@repo/schemas$': '<rootDir>/../../packages/schemas/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
}

export default createJestConfig(config)
