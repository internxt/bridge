/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['utils'],
  collectCoverage: true,
  collectCoverageFrom: [
    './lib/core/**',
    './lib/server/**'
  ]
};