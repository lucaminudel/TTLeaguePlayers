import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatSingleDate } from '../../../src/utils/DateUtils';
import { setUnitFixedClockTime } from '../TestClockUtils';


describe('DateUtils.formatSingleDate', () => {

    beforeEach(() => {
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        setUnitFixedClockTime(undefined);
    });

    // Epoch seconds for a UTC date, so the tests read as dates rather than as magic numbers.
    function epochSecondsOf(isoUtc: string): number {
        return Math.floor(new Date(isoUtc).getTime() / 1000);
    }

    it('omits the year when the date falls in the current year', () => {
        setUnitFixedClockTime('2026-08-08T12:00:00Z');

        expect(formatSingleDate(epochSecondsOf('2026-03-05T09:30:00Z'))).toBe('5 Mar');
    });

    it('shows the year when the date falls in an earlier year', () => {
        setUnitFixedClockTime('2026-08-08T12:00:00Z');

        expect(formatSingleDate(epochSecondsOf('2025-11-20T09:30:00Z'))).toBe('20 Nov, 2025');
    });

    // A season spans two calendar years, so a date ahead of "now" is normal, not an error.
    it('shows the year when the date falls in a later year', () => {
        setUnitFixedClockTime('2025-11-20T12:00:00Z');

        expect(formatSingleDate(epochSecondsOf('2026-03-05T09:30:00Z'))).toBe('5 Mar, 2026');
    });

    it('derives the current year from the fixed clock, not from the real one', () => {
        const invitedAt = epochSecondsOf('2025-12-31T23:59:59Z');

        setUnitFixedClockTime('2025-12-31T23:00:00Z');
        expect(formatSingleDate(invitedAt)).toBe('31 Dec');

        // Same instant, one hour later on the clock — now last year, so the year appears.
        setUnitFixedClockTime('2026-01-01T00:00:00Z');
        expect(formatSingleDate(invitedAt)).toBe('31 Dec, 2025');
    });

    it('formats the day without an ordinal suffix, matching formatTournamentDateRange', () => {
        setUnitFixedClockTime('2026-08-08T12:00:00Z');

        expect(formatSingleDate(epochSecondsOf('2026-01-01T00:00:00Z'))).toBe('1 Jan');
        expect(formatSingleDate(epochSecondsOf('2026-12-23T00:00:00Z'))).toBe('23 Dec');
    });
});
