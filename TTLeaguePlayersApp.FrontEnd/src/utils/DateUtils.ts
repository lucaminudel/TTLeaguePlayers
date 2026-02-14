/**
 * Utility for handling dates and times, allowing for mocking in tests.
 */


/**
 * Returns the current date/time, or a mocked date if set via window.__FIXED_CLOCK_TIME__.
 * This allows E2E tests to control the application's perception of time.
 * 
 * Usage in Playwright tests:
 * ```typescript
 * // 1. For future "hard" navigations or reloads
 * await page.addInitScript(() => {
 *     window.__FIXED_CLOCK_TIME__ = '2025-01-15T14:30:00Z';
 * }, dateTime);    
 * 
 * // 2. For the current page context (if already loaded)
 * await page.evaluate((time) => {
 *     window.__FIXED_CLOCK_TIME__ = time;
 * }, dateTime);    
 * });
 * ```
 */
export function getClockTime(): Date {
    // Check if a mock time has been set (e.g., by E2E tests via page.addInitScript)
    if (typeof window !== 'undefined' && window.__FIXED_CLOCK_TIME__) {
        return new Date(window.__FIXED_CLOCK_TIME__);
    }
    return new Date();
}

/**
 * Formats a date for display (e.g., "Fri 12th Dec 19:00").
 */
export function formatFixtureDateTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${formatFixtureDate(date)} ${hours}:${minutes}`;
}

export function formatFixtureDate(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayName = days[date.getDay()];
    const dayOfMonth = date.getDate();
    const monthName = months[date.getMonth()];

    // Ordinal suffix
    let suffix = 'th';
    if (dayOfMonth === 1 || dayOfMonth === 21 || dayOfMonth === 31) suffix = 'st';
    else if (dayOfMonth === 2 || dayOfMonth === 22) suffix = 'nd';
    else if (dayOfMonth === 3 || dayOfMonth === 23) suffix = 'rd';

    return `${dayName} ${String(dayOfMonth)}${suffix} ${monthName}`;
}

export function shortFormatFixtureDate(date: Date): string {
    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayName = days[date.getDay()];
    const dayOfMonth = date.getDate();
    const monthName = months[date.getMonth()];

    return `${dayName} ${String(dayOfMonth)}-${monthName}`;
}

/**
 * Checks if two dates are the same calendar day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

/**
 * Returns the current time in Epoch seconds.
 */
export function getClockTimeInEpochSeconds(): number {
    return Math.floor(getClockTime().getTime() / 1000);
}
