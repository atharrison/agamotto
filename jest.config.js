/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'app/api/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/cli/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          jsx: 'react-jsx',
        },
      },
    ],
    // ESM-only packages used by app/components/Markdown.tsx (react-markdown and
    // the unified/remark/rehype/micromark ecosystem) are compiled to CJS.
    '^.+\\.m?js$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          allowJs: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    `/node_modules/(?!(?:${[
      'react-markdown',
      'remark-',
      'rehype-',
      'unified',
      'bail',
      'devlop',
      'hast-',
      'html-url-attributes',
      'mdast-',
      'micromark',
      'property-information',
      'space-separated-tokens',
      'comma-separated-tokens',
      'trim-lines',
      'trough',
      'unist-',
      'vfile',
      'zwitch',
      'decode-named-character-reference',
      'character-entities',
      'ccount',
      'markdown-table',
      'is-plain-obj',
      'estree-util-',
      'lowlight',
      'fault',
      'longest-streak',
      'stringify-entities',
      'escape-string-regexp',
    ].join('|')}))`,
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // @octokit/rest ships ESM-only; redirect to a CJS stub for Jest's CommonJS runtime.
    // Tests that need specific Octokit behaviour inject their own mock via the factory arg.
    '^@octokit/rest$': '<rootDir>/__mocks__/@octokit/rest.js',
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
}
