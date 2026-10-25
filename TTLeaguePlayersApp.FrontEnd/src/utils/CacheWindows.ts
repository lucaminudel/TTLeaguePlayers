import type { SWROptions } from './CacheUtils';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// staleDurationMs is the total age at expiry, not time added after freshness.
export const BACKEND_API_SHORT = { freshDurationMs: 2 * HOUR, staleDurationMs: 7 * DAY } as const satisfies SWROptions;
export const BACKEND_API_MEDIUM = { freshDurationMs: 4 * HOUR, staleDurationMs: 10 * DAY } as const satisfies SWROptions;
export const BACKEND_API_LONG = { freshDurationMs: DAY, staleDurationMs: 14 * DAY } as const satisfies SWROptions;

export const TT365_PROCESSOR_SHORT = { freshDurationMs: 12 * HOUR, staleDurationMs: 21 * DAY } as const satisfies SWROptions;
export const TT365_PROCESSOR_MEDIUM = { freshDurationMs: DAY, staleDurationMs: 42 * DAY } as const satisfies SWROptions;
export const TT365_PROCESSOR_LONG = { freshDurationMs: DAY, staleDurationMs: 42 * DAY } as const satisfies SWROptions;
