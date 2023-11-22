/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    './lib/core/**',
    './lib/server/**'
  ],
  modulePathIgnorePatterns: [
    'mongo',
  ]
};