import { randomUUID } from 'node:crypto';

export const uniqueTestEmail = (): string => {
  // Keep generated accounts test_-prefixed for delete-test-users.sh cleanup.
  return `test_${randomUUID()}@delete.me`;
};
