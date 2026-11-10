// Integración de la nómina contra el emulador de Firestore (PLAN_NOMINA.md E3).
// Usa jest y ts-jest de functions/ (cd functions && npm install). Ver README.md.
const path = require('path');
const fn = path.resolve(__dirname, '../../functions/node_modules');
module.exports = {
  rootDir: __dirname,
  testMatch: ['**/*.it.test.ts'],
  testEnvironment: 'node',
  testTimeout: 60000,
  transform: { '^.+\\.ts$': [path.join(fn, 'ts-jest'), { diagnostics: false, tsconfig: { module: 'commonjs', target: 'es2020', esModuleInterop: true } }] },
  moduleDirectories: ['node_modules', fn],
};
