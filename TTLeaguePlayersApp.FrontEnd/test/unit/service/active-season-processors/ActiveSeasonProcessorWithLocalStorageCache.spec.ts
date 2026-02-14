import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { createActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessorFactory';
import { CLTTLActiveSeason2025Processor } from '../../../../src/service/active-season-processors/CLTTLActiveSeason2025Processor';
import type { Fixture } from '../../../../src/service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';
import type { CacheEntry } from '../../../../src/utils/CacheUtils';

// Mock the CLTTL processor so we can spy on it
vi.mock('../../../../src/service/active-season-processors/CLTTLActiveSeason2025Processor');

// Augmented window for testing
interface TestWindow extends Window {
    __FIXED_CLOCK_TIME__?: string;
}

const testWindow = (typeof window !== 'undefined' ? (window as unknown as TestWindow) : ({} as TestWindow));

describe('ActiveSeasonProcessorWithLocalStorageCache', () => {
    const mockFixture: Fixture = {
        startDateTime: new Date('2025-01-01T12:00:00Z'),
        venue: 'Test Venue',
        homeTeam: 'Home',
        awayTeam: 'Away',
        homeTeamPlayers: [],
        awayTeamPlayers: [],
        isCompleted: false
    };

    const mockDataSource: ActiveSeasonDataSource = {
        league: 'TEST',
        season: '2025',
        registrations_start_date: 0,
        ratings_end_date: 0,
        custom_processor: 'CLTTLActiveSeason2025Processor',
        division_tables: [{ 'Div1': 'http://test/tables' }],
        division_fixtures: [{ 'Div1': 'http://test/fixtures' }],
        division_players: [{ 'Div1': 'http://test/players' }]
    };

    const CACHE_KEY = 'cache_TEST_2025_Div1_TeamA';

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        // Reset window property
        testWindow.__FIXED_CLOCK_TIME__ = undefined;
    });

    afterEach(() => {
        vi.useRealTimers();
    })

    // Helper to spy on the "Real" processor instance
    // Since createActiveSeasonProcessor instantiates it internally, we mock the class implementation
    const setupMockProcessor = (fixturesToReturn: Fixture[]) => {
        vi.mocked(CLTTLActiveSeason2025Processor).mockImplementation(function () {
            return {
                getTeamFixtures: vi.fn().mockResolvedValue(fixturesToReturn)
            } as unknown as CLTTLActiveSeason2025Processor;
        });
    };

    const getMockedGetTeamFixtures = (): MockInstance => {
        // Get the instance created by the factory
        const mockInstance = vi.mocked(CLTTLActiveSeason2025Processor).mock.results[0].value as { getTeamFixtures: MockInstance };
        return mockInstance.getTeamFixtures;
    };


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
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<Fixture[]>;
        expect(entry.data).toHaveLength(1);
    });

    it('Fresh Cache: Returns cached data immediately, no network call', async () => {
        setupMockProcessor([mockFixture]);

        // 1. Seed Cache (Time: T0)
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-01T10:00:00Z'; // T0
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures(); // seeds cache
        const spy1 = getMockedGetTeamFixtures();
        expect(spy1).toHaveBeenCalledTimes(1);

        // 2. Advance time by 1 hour (Fresh < 72h)
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-01T11:00:00Z'; // T0 + 1h

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
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-01T10:00:00Z';
        setupMockProcessor([{ ...mockFixture, venue: 'Old Data' }]);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures();

        // 2. Advance time by 4 days (72h < 96h < 144h) -> Stale
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-05T10:00:00Z'; // +96 hrs

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
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw === null) throw new Error('Cache missing');
        const entry = JSON.parse(cachedRaw) as CacheEntry<Fixture[]>;
        expect(entry.data[0].venue).toBe('New Data');
        // New timestamp
        expect(entry.timestamp).toBe(new Date('2025-01-05T10:00:00Z').getTime());
    });

    it('Expired Cache (> 6 days): Fetches new data and returns it', async () => {
        // 1. Seed Cache
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-01T10:00:00Z';
        setupMockProcessor([{ ...mockFixture, venue: 'Old Data' }]);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures();

        // 2. Advance time by 7 days (> 144h) -> Expired / Missing
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-08T10:00:00Z';

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
        const cachedRaw = localStorage.getItem(CACHE_KEY);
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
        // 1. Seed Cache with old data
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-01T10:00:00Z';
        setupMockProcessor([{ ...mockFixture, venue: 'Old Data' }]);
        const processor1 = createActiveSeasonProcessor('CLTTLActiveSeason2025Processor', mockDataSource, 'Div1', 'TeamA');
        await processor1.getTeamFixtures();

        // 2. Advance time to make cache stale (4 days)
        testWindow.__FIXED_CLOCK_TIME__ = '2025-01-05T10:00:00Z';

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
    });
});
