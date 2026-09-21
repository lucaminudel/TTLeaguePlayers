import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { createActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessorFactory';
import { CLTTLActiveSeason2025Processor } from '../../../../src/service/active-season-processors/CLTTLActiveSeason2025Processor';
import type { Fixture } from '../../../../src/service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';
import type { CacheEntry } from '../../../../src/utils/CacheUtils';
import { setUnitFixedClockTime } from '../../TestClockUtils';

// Mock the CLTTL processor so we can spy on it
vi.mock('../../../../src/service/active-season-processors/CLTTLActiveSeason2025Processor');


describe('ActiveSeasonProcessorWithLocalStorageCache', () => {
    const mockFixture: Fixture = {
        startDateTime: new Date('2025-01-01T12:00:00Z'),
        venue: 'Test Venue',
        homeTeam: 'Home',
        awayTeam: 'Away'
    };

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
        club_teams: []
    };

    // The factory supplies the identity prefix; the decorator appends one suffix per method so
    // fixtures and players never share a localStorage entry.
    const FIXTURES_CACHE_KEY = 'cache_TEST_2025_Div1_TeamA_fixtures';
    const PLAYERS_CACHE_KEY = 'cache_TEST_2025_Div1_TeamA_players';

    const mockPlayers = ['Luca Minudel', 'Kevin Ji'];

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        // Reset window property
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    })

    // Helper to spy on the "Real" processor instance
    // Since createActiveSeasonProcessor instantiates it internally, we mock the class implementation
    const setupMockProcessor = (fixturesToReturn: Fixture[], playersToReturn: string[] = []) => {
        vi.mocked(CLTTLActiveSeason2025Processor).mockImplementation(function () {
            return {
                getTeamFixtures: vi.fn().mockResolvedValue(fixturesToReturn),
                getTeamPlayers: vi.fn().mockResolvedValue(playersToReturn)
            } as unknown as CLTTLActiveSeason2025Processor;
        });
    };

    interface MockedProcessorMethods { getTeamFixtures: MockInstance; getTeamPlayers: MockInstance }

    // Get the instance created by the factory
    const getMockedProcessor = (): MockedProcessorMethods =>
        vi.mocked(CLTTLActiveSeason2025Processor).mock.results[0].value as MockedProcessorMethods;

    const getMockedGetTeamFixtures = (): MockInstance => getMockedProcessor().getTeamFixtures;
    const getMockedGetTeamPlayers = (): MockInstance => getMockedProcessor().getTeamPlayers;


    it('Cold Start: Fetches from network and caches result', async () => {
        setupMockProcessor([mockFixture]);

        const processor = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');

        const result = await processor.getTeamFixtures();

        // 1. Check result matches
        expect(result).toHaveLength(1);
        expect(result[0].venue).toBe('Test Venue');

        // 2. Check network call was made
        const getFixturesSpy = getMockedGetTeamFixtures();
        expect(getFixturesSpy).toHaveBeenCalledTimes(1);

        // 3. Check cache was written
        const cachedRaw = localStorage.getItem(FIXTURES_CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<Fixture[]>;
        expect(entry.data).toHaveLength(1);
    });

    it('Fresh Cache: Returns cached data immediately, no network call', async () => {
        setupMockProcessor([mockFixture]);

        // 1. Seed Cache (Time: T0)
        setUnitFixedClockTime('2025-01-01T10:00:00Z'); // T0
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures(); // seeds cache
        const spy1 = getMockedGetTeamFixtures();
        expect(spy1).toHaveBeenCalledTimes(1);

        // 2. Advance time by 1 hour (Fresh < 72h)
        setUnitFixedClockTime('2025-01-01T11:00:00Z'); // T0 + 1h

        // Re-create processor (simulate new page load)
        vi.clearAllMocks();
        setupMockProcessor([{ ...mockFixture, venue: 'Fresh Data' }]); // New data on network

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamFixtures();

        // Expect Cached Data (Old Venue), NOT fresh data
        expect(result[0].venue).toBe('Test Venue');

        // Expect NO network call
        const spy2 = getMockedGetTeamFixtures();
        expect(spy2).not.toHaveBeenCalled();
    });

    it('Stale Cache (< 6 days): Returns cached data AND refreshes in background', async () => {
        // 1. Seed Cache
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor([{ ...mockFixture, venue: 'Old Data' }]);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures();

        // 2. Advance time by 4 days (72h < 96h < 144h) -> Stale
        setUnitFixedClockTime('2025-01-05T10:00:00Z'); // +96 hrs

        vi.clearAllMocks();
        setupMockProcessor([{ ...mockFixture, venue: 'New Data' }]);

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamFixtures();

        // Expect Old Data immediately (stale-while-revalidate)
        expect(result[0].venue).toBe('Old Data');

        // Expect network call happened (background refresh)
        // Wait a tick for fire-and-forget
        await new Promise(resolve => setTimeout(resolve, 0));

        const spy2 = getMockedGetTeamFixtures();
        expect(spy2).toHaveBeenCalledTimes(1);

        // Expect Cache to be updated for NEXT time
        const cachedRaw = localStorage.getItem(FIXTURES_CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<Fixture[]>;
        expect(entry.data[0].venue).toBe('New Data');
        // New timestamp
        expect(entry.timestamp).toBe(new Date('2025-01-05T10:00:00Z').getTime());
    });

    it('Expired Cache (> 6 days): Fetches new data and returns it', async () => {
        // 1. Seed Cache
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor([{ ...mockFixture, venue: 'Old Data' }]);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures();

        // 2. Advance time by 7 days (> 144h) -> Expired / Missing
        setUnitFixedClockTime('2025-01-08T10:00:00Z');

        vi.clearAllMocks();
        setupMockProcessor([{ ...mockFixture, venue: 'Brand New Data' }]);

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamFixtures();

        // Expect New Data returned directly
        expect(result[0].venue).toBe('Brand New Data');

        // Expect network call
        const spy2 = getMockedGetTeamFixtures();
        expect(spy2).toHaveBeenCalledTimes(1);
    });

    it('Handles Date deserialization correctly', async () => {
        setupMockProcessor([mockFixture]);

        const processor = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor.getTeamFixtures();

        // Read directly from cache
        const cachedRaw = localStorage.getItem(FIXTURES_CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<{ startDateTime: string }[]>;
        // JSON stores dates as strings
        expect(typeof entry.data[0].startDateTime).toBe('string');


        // Read via processor (Fresh cache hit)
        const result = await processor.getTeamFixtures();
        // Should return Date object
        expect(result[0].startDateTime).toBeInstanceOf(Date);
        expect(result[0].startDateTime.toISOString()).toBe(mockFixture.startDateTime.toISOString());
    });

    it('should propagate error when refreshCache fails and no cache exists', async () => {
        const mockGetTeamFixtures = vi.fn().mockRejectedValue(new Error('Network failure'));
        vi.mocked(CLTTLActiveSeason2025Processor).mockImplementation(function () {
            return {
                getTeamFixtures: mockGetTeamFixtures
            } as unknown as CLTTLActiveSeason2025Processor;
        });

        const processor = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');

        await expect(processor.getTeamFixtures()).rejects.toThrow('Network failure');
    });

    it('should return stale cache when background refresh fails', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // 1. Seed Cache with old data
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor([{ ...mockFixture, venue: 'Old Data' }]);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures();

        // 2. Advance time to make cache stale (4 days)
        setUnitFixedClockTime('2025-01-05T10:00:00Z');

        // 3. Create new processor with failing mock
        const mockGetTeamFixtures = vi.fn().mockRejectedValue(new Error('Refresh failed'));
        vi.mocked(CLTTLActiveSeason2025Processor).mockImplementation(function () {
            return {
                getTeamFixtures: mockGetTeamFixtures
            } as unknown as CLTTLActiveSeason2025Processor;
        });

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamFixtures();

        // Should return stale data (not throw error)
        expect(result[0].venue).toBe('Old Data');

        // Background refresh should have been attempted - wait for it to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(mockGetTeamFixtures).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Background cache refresh failed'),
            expect.any(Error)
        );
    });

    it('Players Cold Start: fetches from network and caches under the players key', async () => {
        setupMockProcessor([], mockPlayers);

        const processor = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');

        const result = await processor.getTeamPlayers();

        expect(result).toEqual(mockPlayers);
        expect(getMockedGetTeamPlayers()).toHaveBeenCalledTimes(1);

        // Written under the players key only, as a raw string[] (no transformer needed)
        const cachedRaw = localStorage.getItem(PLAYERS_CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<string[]>;
        expect(entry.data).toEqual(mockPlayers);
        expect(localStorage.getItem(FIXTURES_CACHE_KEY)).toBeNull();
    });

    it('Players Fresh Cache: returns cached data immediately, no network call', async () => {
        setupMockProcessor([], mockPlayers);

        // 1. Seed Cache (Time: T0)
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamPlayers();
        expect(getMockedGetTeamPlayers()).toHaveBeenCalledTimes(1);

        // 2. Advance time by 1 hour (Fresh < 24h)
        setUnitFixedClockTime('2025-01-01T11:00:00Z');

        vi.clearAllMocks();
        setupMockProcessor([], ['New Player']);

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamPlayers();

        expect(result).toEqual(mockPlayers);
        expect(getMockedGetTeamPlayers()).not.toHaveBeenCalled();
    });

    // The players window is SHORTER than the fixtures one (24h fresh / 3d stale vs 72h / 6d): the
    // roster is what the captain's invitation-status view is keyed on.
    it('Players Stale Cache (< 3 days): returns cached data AND refreshes in background', async () => {
        // 1. Seed Cache
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor([], mockPlayers);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamPlayers();

        // 2. Advance time by 2 days (24h < 48h < 72h) -> Stale
        setUnitFixedClockTime('2025-01-03T10:00:00Z');

        vi.clearAllMocks();
        setupMockProcessor([], ['New Player']);

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamPlayers();

        // Old data immediately (stale-while-revalidate)
        expect(result).toEqual(mockPlayers);

        // Background refresh happened and the cache now holds the new data
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(getMockedGetTeamPlayers()).toHaveBeenCalledTimes(1);

        const cachedRaw = localStorage.getItem(PLAYERS_CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<string[]>;
        expect(entry.data).toEqual(['New Player']);
        expect(entry.timestamp).toBe(new Date('2025-01-03T10:00:00Z').getTime());
    });

    it('Players Expired Cache (> 3 days): fetches new data and returns it', async () => {
        // 1. Seed Cache
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        setupMockProcessor([], mockPlayers);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamPlayers();

        // 2. Advance time by 4 days (> 72h) -> Expired. The FIXTURES cache would still be stale-but-
        // served at this age; the players cache is not.
        setUnitFixedClockTime('2025-01-05T10:00:00Z');

        vi.clearAllMocks();
        setupMockProcessor([], ['New Player']);

        const processor2 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        const result = await processor2.getTeamPlayers();

        // New data, fetched synchronously — not the stale roster
        expect(result).toEqual(['New Player']);
        expect(getMockedGetTeamPlayers()).toHaveBeenCalledTimes(1);
    });

    it('Fixtures and players are cached under distinct keys', async () => {
        setupMockProcessor([mockFixture], mockPlayers);

        const processor = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');

        await processor.getTeamFixtures();
        await processor.getTeamPlayers();

        // Two entries, two different keys
        expect(FIXTURES_CACHE_KEY).not.toBe(PLAYERS_CACHE_KEY);
        expect(localStorage.getItem(FIXTURES_CACHE_KEY)).not.toBeNull();
        expect(localStorage.getItem(PLAYERS_CACHE_KEY)).not.toBeNull();

        // A fresh read of each returns its own data, with no further network call:
        // this is the case a shared key would break (fixtures read back as players, or vice-versa).
        const fixtures = await processor.getTeamFixtures();
        const players = await processor.getTeamPlayers();
        expect(fixtures[0].venue).toBe('Test Venue');
        expect(players).toEqual(mockPlayers);
        expect(getMockedGetTeamFixtures()).toHaveBeenCalledTimes(1);
        expect(getMockedGetTeamPlayers()).toHaveBeenCalledTimes(1);
    });
});
