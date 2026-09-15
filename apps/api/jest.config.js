module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\.spec\.ts$',
  transform: { '^.+\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testEnvironment: 'node',
  testTimeout: 20000,
  // Keep-alive sockets in the HTTP test server can outlive the run.
  forceExit: true,
};
