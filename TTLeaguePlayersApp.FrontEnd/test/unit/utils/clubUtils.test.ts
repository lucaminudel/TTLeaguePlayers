import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { selectActiveManagedClubs, createManagedClubKey } from '../../../src/utils/clubUtils';
import type { ActiveSeasonDataSource } from '../../../src/config/environment';
import type { ManagedClub } from '../../../src/contexts/AuthContextDefinition';

describe('clubUtils.selectActiveManagedClubs', () => {
    const epochOf = (isoUtc: string) => Math.floor(new Date(isoUtc).getTime() / 1000);

    const club = (overrides: Partial<ManagedClub> = {}): ManagedClub => ({
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Walworth Table Tennis Club',
        club_location: 'London',
        manager_name: 'Luca Minudel',
        ...overrides,
    });

    const dataSource = (overrides: Partial<ActiveSeasonDataSource> = {}): ActiveSeasonDataSource => ({
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: epochOf('2025-08-01T00:00:00Z'),
        ratings_end_date: epochOf('2026-05-01T00:00:00Z'),
        division_tables: [],
        division_fixtures: [],
        division_players: [],
        club_teams: [],
        ...overrides,
    });

    let consoleInfoSpy: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    afterEach(() => { consoleInfoSpy.mockRestore(); });

    it('keeps a club whose season is open, and hands back the data source that matched', () => {
        const source = dataSource();

        const result = selectActiveManagedClubs([club()], [source], epochOf('2026-01-15T00:00:00Z'));

        expect(result.active).toHaveLength(1);
        expect(result.active[0].dataSource).toBe(source);
        expect(result.excluded).toHaveLength(0);
    });

    it('excludes a club before its registrations open', () => {
        const result = selectActiveManagedClubs([club()], [dataSource()], epochOf('2025-07-31T00:00:00Z'));

        expect(result.active).toHaveLength(0);
        expect(result.excluded).toEqual([{ club: club(), reason: 'SEASON_NOT_ACTIVE' }]);
    });

    // The window deliberately runs to the END OF THE CALENDAR YEAR containing ratings_end_date,
    // not to ratings_end_date itself.
    it('keeps a club after the ratings end date but within that calendar year', () => {
        const result = selectActiveManagedClubs([club()], [dataSource()], epochOf('2026-11-30T00:00:00Z'));

        expect(result.active).toHaveLength(1);
    });

    it('excludes a club once that calendar year has ended', () => {
        const result = selectActiveManagedClubs([club()], [dataSource()], epochOf('2027-01-01T00:00:01Z'));

        expect(result.active).toHaveLength(0);
        expect(result.excluded[0].reason).toBe('SEASON_NOT_ACTIVE');
    });

    it('excludes and logs a club whose league-season is not configured', () => {
        const result = selectActiveManagedClubs(
            [club({ league: 'NOSUCH' })], [dataSource()], epochOf('2026-01-15T00:00:00Z')
        );

        expect(result.active).toHaveLength(0);
        expect(result.excluded[0].reason).toBe('DATA_SOURCE_NOT_FOUND');
        expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('excludes and logs every club when the config carries no data sources', () => {
        const result = selectActiveManagedClubs([club()], [], epochOf('2026-01-15T00:00:00Z'));

        expect(result.active).toHaveLength(0);
        expect(result.excluded[0].reason).toBe('CONFIG_MISSING');
        expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('excludes and logs every club when the config is missing entirely', () => {
        const result = selectActiveManagedClubs([club()], undefined, epochOf('2026-01-15T00:00:00Z'));

        expect(result.active).toHaveLength(0);
        expect(result.excluded[0].reason).toBe('CONFIG_MISSING');
        expect(consoleInfoSpy).toHaveBeenCalled();
    });

    // One broken entry must not cost a manager the clubs that are fine.
    it('keeps the good clubs when one of them cannot be resolved', () => {
        const good = club();
        const bad = club({ league: 'NOSUCH', club_name: 'Highbury Table Tennis Club' });

        const result = selectActiveManagedClubs([bad, good], [dataSource()], epochOf('2026-01-15T00:00:00Z'));

        expect(result.active.map((entry) => entry.club.club_name)).toEqual(['Walworth Table Tennis Club']);
        expect(result.excluded.map((entry) => entry.club.club_name)).toEqual(['Highbury Table Tennis Club']);
    });

    // The reason is per club, not per call: one manager can hold clubs that fail for different
    // reasons at the same time, and a caller that reports the reason must not report one of them
    // for all of them.
    it('gives each excluded club its own reason within a single call', () => {
        const unconfigured = club({ league: 'NOSUCH', club_name: 'Highbury Table Tennis Club' });
        const outOfSeason = club({ season: '2019-2020', club_name: 'Moberly Table Tennis Club' });
        const openSeason = club();

        const result = selectActiveManagedClubs(
            [unconfigured, outOfSeason, openSeason],
            [dataSource(), dataSource({ season: '2019-2020', ratings_end_date: epochOf('2020-05-01T00:00:00Z') })],
            epochOf('2026-01-15T00:00:00Z')
        );

        expect(result.active.map((entry) => entry.club.club_name)).toEqual(['Walworth Table Tennis Club']);
        expect(result.excluded).toEqual([
            { club: unconfigured, reason: 'DATA_SOURCE_NOT_FOUND' },
            { club: outOfSeason, reason: 'SEASON_NOT_ACTIVE' },
        ]);
    });

    // Validated inputs keep this path very nearly unreachable — see the UNEXPECTED_ERROR doc in
    // clubUtils.ts for the one config shape that does reach it. The failure is forced here because
    // the point of the reason field is that a failure it does not recognise is reported as unknown
    // rather than borrowing the label of one it does.
    it('reports an unrecognised failure as UNEXPECTED_ERROR, not as a known reason', () => {
        const exploding = dataSource();
        Object.defineProperty(exploding, 'ratings_end_date', {
            get() { throw new Error('Network failure'); },
        });

        const result = selectActiveManagedClubs([club()], [exploding], epochOf('2026-01-15T00:00:00Z'));

        expect(result.active).toHaveLength(0);
        expect(result.excluded).toEqual([{ club: club(), reason: 'UNEXPECTED_ERROR' }]);
        expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('preserves the order the clubs were given in', () => {
        const first = club({ club_name: 'Zulu Table Tennis Club' });
        const second = club({ club_name: 'Alpha Table Tennis Club' });

        const result = selectActiveManagedClubs([first, second], [dataSource()], epochOf('2026-01-15T00:00:00Z'));

        expect(result.active.map((entry) => entry.club.club_name))
            .toEqual(['Zulu Table Tennis Club', 'Alpha Table Tennis Club']);
    });
});

describe('clubUtils.createManagedClubKey', () => {
    it('keys on league, season and club name', () => {
        expect(createManagedClubKey({ league: 'CLTTL', season: '2025-2026', club_name: 'Walworth' }))
            .toBe('CLTTL-2025-2026-Walworth');
    });
});
