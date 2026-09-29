const workerIndex = process.env.TEST_WORKER_INDEX ?? '0';
let lastEpochMs = 0;
export const uniqueTestEmail = (): string => {
  // Format: test_<epoch milliseconds>_<worker index>@delete.me - still `test_`-prefixed, which is
  // the whole of what delete-test-users.sh matches on when it cleans the pool.
  const now = Date.now();
  lastEpochMs = now <= lastEpochMs ? lastEpochMs + 1 : now;
  return `test_${String(lastEpochMs)}_${workerIndex}@delete.me`;
};
