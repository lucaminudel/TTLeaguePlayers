import path from 'node:path';
import { fileURLToPath } from 'node:url';
import incrementalConfig from './stryker.config.mjs';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  ...incrementalConfig,
  force: true,
  incrementalFile: path.join(frontendRoot, 'reports/mutation/full/stryker-incremental.json'),
  htmlReporter: {
    fileName: path.join(frontendRoot, 'reports/mutation/full/mutation.html'),
  },
};
