/**
 * Helper to set a fixed clock time in unit tests (Vitest/JSDOM).
 * Passing undefined resets the fixed clock.
 */
export function setUnitFixedClockTime(dateTime?: string): void {
    if (typeof window !== 'undefined') {
        window.__FIXED_CLOCK_TIME__ = dateTime;
    }
}
