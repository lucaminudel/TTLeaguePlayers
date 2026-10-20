import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

process.env.TTLEAGUEPLAYERS_CONFIG_ROOT = path.resolve(frontendRoot, '..', 'config');

export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  vitest: {
    configFile: 'vite.config.ts',
  },
  concurrency: 2,
  cleanTempDir: 'always',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation.html',
  },
};
