module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\.e2e-spec\.ts$',
  transform: { '^.+\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testEnvironment: 'node',
  testTimeout: 60000,
};
