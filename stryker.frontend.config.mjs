import path from 'node:path';
import { fileURLToPath } from 'node:url';
import incrementalConfig from './TTLeaguePlayersApp.FrontEnd/stryker.config.mjs';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

process.env.TTLEAGUEPLAYERS_CONFIG_ROOT = path.join(repositoryRoot, 'config');

export default {
  ...incrementalConfig,
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [
    'TTLeaguePlayersApp.FrontEnd/src/**/*.{ts,tsx}',
    '!TTLeaguePlayersApp.FrontEnd/src/**/*.d.ts',
  ],
  testFiles: ['TTLeaguePlayersApp.FrontEnd/test/unit/**/*.{test,spec}.{ts,tsx}'],
  vitest: {
    configFile: 'TTLeaguePlayersApp.FrontEnd/vite.config.ts',
  },
  concurrency: 2,
  cleanTempDir: 'always',
  reporters: ['clear-text', 'progress', 'html'],
};
