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
  incremental: true,
  incrementalFile: path.join(frontendRoot, 'reports/mutation/incremental/stryker-incremental.json'),
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: {
    fileName: path.join(frontendRoot, 'reports/mutation/incremental/mutation.html'),
  },
};
