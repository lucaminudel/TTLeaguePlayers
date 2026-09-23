import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { hasCaptainRole, isCaptainSeason, selectCaptainSeasons } from '../../../src/utils/activeSeasonUtils';
import type { ActiveSeasonDataSource } from '../../../src/config/environment';
import type { ActiveSeason } from '../../../src/contexts/AuthContextDefinition';

describe('activeSeasonUtils.selectCaptainSeasons', () => {
    const epochOf = (isoUtc: string) => Math.floor(new Date(isoUtc).getTime() / 1000);

    const season = (overrides: Partial<ActiveSeason> = {}): ActiveSeason => ({
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Morpeth 10',
        team_division: 'Division 4',
        person_name: 'Luca Minudel',
        role: 'CAPTAIN',
        latest_kudos: [],
        ...overrides,
    });

    const dataSource = (overrides: Partial<ActiveSeasonDataSource> = {}): ActiveSeasonDataSource => ({
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: epochOf('2025-08-20T00:00:00Z'),
        ratings_end_date: epochOf('2026-04-30T00:00:00Z'),
        division_tables: [],
        division_fixtures: [],
        division_players: [],
        club_teams: [],
        ...overrides,
    });

    const INSIDE_THE_WINDOW = '2026-01-15T11:01:48Z';

    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => { consoleErrorSpy.mockRestore(); });

    it('keeps a captain season whose window is open, and hands back the data source that matched', () => {
        const source = dataSource();

        const result = selectCaptainSeasons([season()], [source], epochOf(INSIDE_THE_WINDOW));

        expect(result).toHaveLength(1);
        expect(result[0].season.team_name).toBe('Morpeth 10');
        expect(result[0].dataSource).toBe(source);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('excludes a PLAYER registration', () => {
        const result = selectCaptainSeasons([season({ role: 'PLAYER' })], [dataSource()], epochOf(INSIDE_THE_WINDOW));

        expect(result).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('excludes a captain season before its registrations open', () => {
        const result = selectCaptainSeasons([season()], [dataSource()], epochOf('2025-08-19T23:59:59Z'));

        expect(result).toEqual([]);
    });

    it('excludes a captain season the moment ratings_end_date has passed', () => {
        const result = selectCaptainSeasons([season()], [dataSource()], epochOf('2026-04-30T00:00:01Z'));

        expect(result).toEqual([]);
    });

    it('keeps a captain season exactly on registrations_start_date and exactly on ratings_end_date', () => {
        const atStart = selectCaptainSeasons([season()], [dataSource()], epochOf('2025-08-20T00:00:00Z'));
        const atEnd = selectCaptainSeasons([season()], [dataSource()], epochOf('2026-04-30T00:00:00Z'));

        expect(atStart).toHaveLength(1);
        expect(atEnd).toHaveLength(1);
    });

    it('excludes and logs a captain season with no matching data source', () => {
        const result = selectCaptainSeasons([season({ league: 'BCS' })], [dataSource()], epochOf(INSIDE_THE_WINDOW));

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ Page event log processing captain season:',
            expect.objectContaining({ message: expect.stringContaining('Data source not found for league "BCS"') as string })
        );
    });

    it('matches the data source on season as well as league', () => {
        const result = selectCaptainSeasons([season({ season: '2024-2025' })], [dataSource()], epochOf(INSIDE_THE_WINDOW));

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ Page event log processing captain season:',
            expect.objectContaining({ message: expect.stringContaining('season "2024-2025"') as string })
        );
    });

    it('excludes and logs every captain season when the config list is undefined', () => {
        const result = selectCaptainSeasons([season()], undefined, epochOf(INSIDE_THE_WINDOW));

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ Page event log processing captain season:',
            expect.objectContaining({ message: expect.stringContaining('active_seasons_data_source is missing') as string })
        );
    });

    it('excludes and logs every captain season when the config list is empty', () => {
        const result = selectCaptainSeasons([season()], [], epochOf(INSIDE_THE_WINDOW));

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ Page event log processing captain season:',
            expect.objectContaining({ message: expect.stringContaining('active_seasons_data_source is missing') as string })
        );
    });

    it('keeps several captaincies in the order they were given', () => {
        const bcs = dataSource({ league: 'BCS', season: '2025-2026' });

        const result = selectCaptainSeasons(
            [
                season({ league: 'BCS', team_name: 'Morpeth B', team_division: 'Division 2' }),
                season({ role: 'PLAYER', team_name: 'Fusion 5' }),
                season(),
            ],
            [dataSource(), bcs],
            epochOf(INSIDE_THE_WINDOW)
        );

        expect(result).toHaveLength(2);
        expect(result[0].season.team_name).toBe('Morpeth B');
        expect(result[0].dataSource).toBe(bcs);
        expect(result[1].season.team_name).toBe('Morpeth 10');
    });

    it('returns an empty list when the user has no active seasons at all', () => {
        expect(selectCaptainSeasons([], [dataSource()], epochOf(INSIDE_THE_WINDOW))).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});

describe('activeSeasonUtils.isCaptainSeason', () => {
    const season = (role: string): ActiveSeason => ({
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Morpeth 10',
        team_division: 'Division 4',
        person_name: 'Luca Minudel',
        role,
        latest_kudos: [],
    });

    it('recognises a CAPTAIN registration', () => {
        expect(isCaptainSeason(season('CAPTAIN'))).toBe(true);
    });

    it('rejects a PLAYER registration', () => {
        expect(isCaptainSeason(season('PLAYER'))).toBe(false);
    });

    it('rejects a lower-case role, because the match is exact', () => {
        expect(isCaptainSeason(season('captain'))).toBe(false);
    });
});

describe('activeSeasonUtils.hasCaptainRole', () => {
    const season = (role: string, team_name = 'Morpeth 10'): ActiveSeason => ({
        league: 'CLTTL',
        season: '2025-2026',
        team_name,
        team_division: 'Division 4',
        person_name: 'Luca Minudel',
        role,
        latest_kudos: [],
    });

    it('returns false when there are no active seasons', () => {
        expect(hasCaptainRole([])).toBe(false);
    });

    it('returns false when every active season is a PLAYER registration', () => {
        expect(hasCaptainRole([season('PLAYER'), season('PLAYER', 'Fusion 5')])).toBe(false);
    });

    it('returns true when at least one active season is a CAPTAIN registration', () => {
        expect(hasCaptainRole([season('PLAYER'), season('CAPTAIN', 'Morpeth 9')])).toBe(true);
    });
});
