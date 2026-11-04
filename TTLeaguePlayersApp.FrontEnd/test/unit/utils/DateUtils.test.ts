import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    formatFixtureDate, formatFixtureDateTime, formatSingleDate, formatTournamentDateRange,
    getClockTime, getClockTimeInEpochSeconds, isSameDay, shortFormatFixtureDate,
} from '../../../src/utils/DateUtils';
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


describe('DateUtils clock and fixture dates', () => {
    afterEach(() => {
        setUnitFixedClockTime(undefined);
        vi.useRealTimers();
    });

    it('uses the fixed clock when set and the system clock when cleared', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2030-04-05T06:07:08.987Z'));
        setUnitFixedClockTime('2026-01-02T03:04:05.678Z');
        expect(getClockTime().toISOString()).toBe('2026-01-02T03:04:05.678Z');
        expect(getClockTimeInEpochSeconds()).toBe(1767323045);
        setUnitFixedClockTime(undefined);
        expect(getClockTime().toISOString()).toBe('2030-04-05T06:07:08.987Z');
        expect(getClockTimeInEpochSeconds()).toBe(Math.floor(new Date('2030-04-05T06:07:08.987Z').getTime() / 1000));
    });

    it.each([
        [1, 'st'], [2, 'nd'], [3, 'rd'], [4, 'th'], [11, 'th'], [12, 'th'],
        [13, 'th'], [21, 'st'], [22, 'nd'], [23, 'rd'], [31, 'st'],
    ] as const)('formats day %i with the %s ordinal suffix', (day, suffix) => {
        const date = new Date(Date.UTC(2026, 0, day, 23, 5));
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        expect(formatFixtureDate(date)).toBe(`${weekdays[date.getUTCDay()]} ${String(day)}${suffix} Jan`);
    });

    it('uses UTC parts and zero-padded time in fixture formats', () => {
        const date = new Date('2026-12-31T23:05:00-02:00');
        expect(formatFixtureDate(date)).toBe('Fri 1st Jan');
        expect(formatFixtureDateTime(date)).toBe('Fri 1st Jan 01:05');
        expect(shortFormatFixtureDate(date)).toBe('Fr 1-Jan');
    });

    it.each([
        [1, 'Thu 1st Jan', 'Th 1-Jan', '1 Jan'],
        [2, 'Sun 1st Feb', 'Su 1-Feb', '1 Feb'],
        [3, 'Sun 1st Mar', 'Su 1-Mar', '1 Mar'],
        [4, 'Wed 1st Apr', 'We 1-Apr', '1 Apr'],
        [5, 'Fri 1st May', 'Fr 1-May', '1 May'],
        [6, 'Mon 1st Jun', 'Mo 1-Jun', '1 Jun'],
        [7, 'Wed 1st Jul', 'We 1-Jul', '1 Jul'],
        [8, 'Sat 1st Aug', 'Sa 1-Aug', '1 Aug'],
        [9, 'Tue 1st Sep', 'Tu 1-Sep', '1 Sep'],
        [10, 'Thu 1st Oct', 'Th 1-Oct', '1 Oct'],
        [11, 'Sun 1st Nov', 'Su 1-Nov', '1 Nov'],
        [12, 'Tue 1st Dec', 'Tu 1-Dec', '1 Dec'],
    ] as const)('formats UTC month %i in all date formats', (month, fixture, shortFixture, single) => {
        setUnitFixedClockTime('2026-08-08T12:00:00Z');
        const date = new Date(Date.UTC(2026, month - 1, 1, 12));
        expect(formatFixtureDate(date)).toBe(fixture);
        expect(shortFormatFixtureDate(date)).toBe(shortFixture);
        expect(formatSingleDate(date.getTime() / 1000)).toBe(single);
    });

    it.each([
        ['2026-01-01T00:00:00Z', '2026-01-01T23:59:59Z', true],
        ['2026-01-01T23:59:59Z', '2026-01-02T00:00:00Z', false],
        ['2026-01-01T12:00:00Z', '2026-02-01T12:00:00Z', false],
        ['2026-01-01T12:00:00Z', '2027-01-01T12:00:00Z', false],
        ['2026-01-01T23:30:00-02:00', '2026-01-02T01:30:00Z', true],
    ] as const)('compares UTC calendar days for %s and %s', (first, second, expected) => {
        expect(isSameDay(new Date(first), new Date(second))).toBe(expected);
    });
});

describe('DateUtils.formatTournamentDateRange', () => {
    // The range formatter deliberately uses local date parts. Construct local noon so that
    // neither the date nor the fixed clock depends on the machine's timezone.
    const localEpoch = (year: number, month: number, day: number) =>
        new Date(year, month - 1, day, 12).getTime() / 1000;
    const monthName = (month: number) =>
        new Date(2026, month - 1, 15, 12).toLocaleString('default', { month: 'short' });

    beforeEach(() => { setUnitFixedClockTime('2026-08-08T12:00:00'); });
    afterEach(() => { setUnitFixedClockTime(undefined); });

    it.each([
        [2026, 3, 5, 2026, 3, 5, () => `5 ${monthName(3)}`],
        [2026, 3, 5, 2026, 3, 8, () => `5 - 8 ${monthName(3)}`],
        [2026, 3, 5, 2026, 4, 8, () => `5 ${monthName(3)} - 8 ${monthName(4)}`],
        [2026, 3, 5, 2026, 4, 5, () => `5 ${monthName(3)} - 5 ${monthName(4)}`],
        [2025, 3, 5, 2025, 3, 8, () => `5 - 8 ${monthName(3)}, 2025`],
        [2025, 12, 30, 2026, 1, 2, () => `30 ${monthName(12)}, 2025 - 2 ${monthName(1)}, 2026`],
        [2026, 12, 30, 2027, 1, 2, () => `30 ${monthName(12)}, 2026 - 2 ${monthName(1)}, 2027`],
        [2025, 3, 5, 2026, 3, 5, () => `5, 2025 - 5 ${monthName(3)}, 2026`],
    ] as const)('formats %i-%i-%i through %i-%i-%i', (sy, sm, sd, ey, em, ed, expected) => {
        expect(formatTournamentDateRange(localEpoch(sy, sm, sd), localEpoch(ey, em, ed))).toBe(expected());
    });
});
