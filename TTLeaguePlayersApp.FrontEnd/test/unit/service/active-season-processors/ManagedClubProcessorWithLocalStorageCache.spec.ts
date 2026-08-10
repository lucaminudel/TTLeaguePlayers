import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { createManagedClubProcessor } from '../../../../src/service/active-season-processors/ManagedClubProcessorFactory';
import { CLTTLManagedClub2025Processor } from '../../../../src/service/active-season-processors/CLTTLManagedClub2025Processor';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';
import type { CacheEntry } from '../../../../src/utils/CacheUtils';
import { setUnitFixedClockTime } from '../../TestClockUtils';

// Mock the CLTTL club processor so we can spy on it
vi.mock('../../../../src/service/active-season-processors/CLTTLManagedClub2025Processor');

describe('ManagedClubProcessorWithLocalStorageCache', () => {
    const mockDataSource: ActiveSeasonDataSource = {
        league: 'TEST',
        season: '2025',
        registrations_start_date: 0,
        ratings_end_date: 0,
        custom_processor: 'CLTTLActiveSeason2025Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        division_tables: [{ 'Div1': 'http://test/tables' }],
        division_fixtures: [{ 'Div1': 'http://test/fixtures' }],
        division_players: [{ 'Div1': 'http://test/players' }],
        club_teams: [{ 'Morpeth Table Tennis Club': 'http://test/clubs/morpeth' }]
    };

    const CLUB = 'Morpeth Table Tennis Club';
    const LOCATION = 'London';
    const CACHE_KEY = 'cache_club_TEST_2025_London_Morpeth Table Tennis Club';

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const setupMockProcessor = (teamsToReturn: string[]) => {
        vi.mocked(CLTTLManagedClub2025Processor).mockImplementation(function () {
            return {
                getClubTeams: vi.fn().mockResolvedValue(teamsToReturn)
            } as unknown as CLTTLManagedClub2025Processor;
        });
    };

    const getMockedGetClubTeams = (): MockInstance => {
        const mockInstance = vi.mocked(CLTTLManagedClub2025Processor).mock.results[0].value as { getClubTeams: MockInstance };
        return mockInstance.getClubTeams;
    };

    it('should throw for a processor name that is not registered', () => {
        expect(() => createManagedClubProcessor('NoSuchProcessor', mockDataSource, CLUB, LOCATION))
            .toThrow('Managed Club Processor "NoSuchProcessor" not present or registered.');
    });

    it('Cold Start: Fetches from network and caches result', async () => {
        setupMockProcessor(['Morpeth 1', 'Morpeth 2']);

        const processor = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);

        const result = await processor.getClubTeams();

        expect(result).toEqual(['Morpeth 1', 'Morpeth 2']);
        expect(getMockedGetClubTeams()).toHaveBeenCalledTimes(1);

        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<string[]>;
        expect(entry.data).toEqual(['Morpeth 1', 'Morpeth 2']);
    });

    it('Fresh Cache: Returns cached data immediately, no network call', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor(['Morpeth 1']);
        const processor1 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        await processor1.getClubTeams();
        expect(getMockedGetClubTeams()).toHaveBeenCalledTimes(1);

        // Advance 1 hour: still fresh (< 72h)
        setUnitFixedClockTime('2025-01-01T11:00:00Z');

        vi.clearAllMocks();
        setupMockProcessor(['Fresh Team']);

        const processor2 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        const result = await processor2.getClubTeams();

        expect(result).toEqual(['Morpeth 1']);
        expect(getMockedGetClubTeams()).not.toHaveBeenCalled();
    });

    it('Stale Cache (< 6 days): Returns cached data AND refreshes in background', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor(['Old Team']);
        const processor1 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        await processor1.getClubTeams();

        // Advance 4 days: stale (72h < 96h < 144h)
        setUnitFixedClockTime('2025-01-05T10:00:00Z');

        vi.clearAllMocks();
        setupMockProcessor(['New Team']);

        const processor2 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        const result = await processor2.getClubTeams();

        // Stale data returned immediately
        expect(result).toEqual(['Old Team']);

        // Background refresh happened
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(getMockedGetClubTeams()).toHaveBeenCalledTimes(1);

        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<string[]>;
        expect(entry.data).toEqual(['New Team']);
        expect(entry.timestamp).toBe(new Date('2025-01-05T10:00:00Z').getTime());
    });

    it('Expired Cache (> 6 days): Fetches new data and returns it', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor(['Old Team']);
        const processor1 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        await processor1.getClubTeams();

        setUnitFixedClockTime('2025-01-08T10:00:00Z'); // +7 days

        vi.clearAllMocks();
        setupMockProcessor(['Brand New Team']);

        const processor2 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        const result = await processor2.getClubTeams();

        expect(result).toEqual(['Brand New Team']);
        expect(getMockedGetClubTeams()).toHaveBeenCalledTimes(1);
    });

    it('gives each club its own cache entry', async () => {
        setupMockProcessor(['Morpeth 1']);
        const morpeth = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        await morpeth.getClubTeams();

        vi.clearAllMocks();
        setupMockProcessor(['Walworth Tigers']);
        const walworth = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, 'Walworth Table Tennis Club', LOCATION);
        const result = await walworth.getClubTeams();

        // A second club must not read the first club's cache entry.
        expect(result).toEqual(['Walworth Tigers']);
        expect(getMockedGetClubTeams()).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
        expect(localStorage.getItem('cache_club_TEST_2025_London_Walworth Table Tennis Club')).not.toBeNull();
    });

    // Two clubs in different towns can carry the same name, so the name alone does not identify a club.
    it('gives each location its own cache entry when two clubs share a name', async () => {
        setupMockProcessor(['London Morpeth 1']);
        const london = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, 'London');
        await london.getClubTeams();

        vi.clearAllMocks();
        setupMockProcessor(['Manchester Morpeth 1']);
        const manchester = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, 'Manchester');
        const result = await manchester.getClubTeams();

        // The second location must not read the first location's cache entry.
        expect(result).toEqual(['Manchester Morpeth 1']);
        expect(getMockedGetClubTeams()).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(`cache_club_TEST_2025_London_${CLUB}`)).not.toBeNull();
        expect(localStorage.getItem(`cache_club_TEST_2025_Manchester_${CLUB}`)).not.toBeNull();
    });

    it('does not collide with the active season fixtures cache key', async () => {
        setupMockProcessor(['Morpeth 1']);
        const processor = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        await processor.getClubTeams();

        // The fixtures decorator uses cache_{league}_{season}_{division}_{team}
        expect(CACHE_KEY.startsWith('cache_club_')).toBe(true);
        expect(localStorage.getItem('cache_TEST_2025_Div1_TeamA')).toBeNull();
    });

    it('should propagate error when refreshCache fails and no cache exists', async () => {
        vi.mocked(CLTTLManagedClub2025Processor).mockImplementation(function () {
            return {
                getClubTeams: vi.fn().mockRejectedValue(new Error('Network failure'))
            } as unknown as CLTTLManagedClub2025Processor;
        });

        const processor = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);

        await expect(processor.getClubTeams()).rejects.toThrow('Network failure');
    });

    it('should return stale cache when background refresh fails', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor(['Old Team']);
        const processor1 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        await processor1.getClubTeams();

        setUnitFixedClockTime('2025-01-05T10:00:00Z');

        vi.mocked(CLTTLManagedClub2025Processor).mockImplementation(function () {
            return {
                getClubTeams: vi.fn().mockRejectedValue(new Error('Refresh failed'))
            } as unknown as CLTTLManagedClub2025Processor;
        });

        const processor2 = createManagedClubProcessor('CLTTLManagedClub2025Processor', mockDataSource, CLUB, LOCATION);
        const result = await processor2.getClubTeams();

        expect(result).toEqual(['Old Team']);

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(consoleWarnSpy).toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
    });
});
