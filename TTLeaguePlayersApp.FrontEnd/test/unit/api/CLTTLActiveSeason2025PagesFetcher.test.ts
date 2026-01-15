import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLTTLActiveSeason2025PagesFetcher, PageFetcherError } from '../../../src/api/CLTTLActiveSeason2025PagesFetcher';
import type { ActiveSeasonDataSource } from '../../../src/config/environment';

describe('CLTTLActiveSeason2025PagesFetcher', () => {
    const mockDataSource: ActiveSeasonDataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        registrations_start_date: 0,
        ratings_end_date: 0,
        division_tables: [{ 'Division 1': 'http://tables/div1' }],
        division_fixtures: [{ 'Division 1': 'http://fixtures/div1' }],
        division_players: [{ 'Division 1': 'http://players/div1' }],
    };

    let fetcher: CLTTLActiveSeason2025PagesFetcher;

    beforeEach(() => {
        vi.useFakeTimers();
        fetcher = new CLTTLActiveSeason2025PagesFetcher(mockDataSource);
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should successfully fetch content on the first try', async () => {
        const mockResponse = {
            ok: true,
            text: () => Promise.resolve('<html>Success</html>'),
        };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        const result = await fetcher.getTeams('Division 1');

        expect(result).toBe('<html>Success</html>');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('http://tables/div1');
    });

    it('should retry twice and succeed on the third try', async () => {
        const failResponse = { ok: false, status: 500 };
        const successResponse = { ok: true, text: () => Promise.resolve('<html>Success</html>') };

        vi.mocked(fetch)
            .mockResolvedValueOnce(failResponse as Response)
            .mockResolvedValueOnce(failResponse as Response)
            .mockResolvedValueOnce(successResponse as Response);

        const fetchPromise = fetcher.getTeams('Division 1');

        // Process microtasks and advance timers
        await vi.advanceTimersByTimeAsync(2000); // After 1st try failure
        await vi.advanceTimersByTimeAsync(2000); // After 2nd try failure

        const result = await fetchPromise;

        expect(result).toBe('<html>Success</html>');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should retry if content contains "Service unavailable"', async () => {
        const unavailableResponse = { ok: true, text: () => Promise.resolve('Service unavailable') };
        const successResponse = { ok: true, text: () => Promise.resolve('<html>Success</html>') };

        vi.mocked(fetch)
            .mockResolvedValueOnce(unavailableResponse as Response)
            .mockResolvedValueOnce(successResponse as Response);

        const fetchPromise = fetcher.getTeams('Division 1');

        await vi.advanceTimersByTimeAsync(2000);

        const result = await fetchPromise;
        expect(result).toBe('<html>Success</html>');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw PageFetcherError after 3 failed attempts', async () => {
        const failResponse = { ok: false, status: 500 };
        vi.mocked(fetch).mockResolvedValue(failResponse as Response);

        const fetchPromise = fetcher.getTeams('Division 1');

        // Assertion expectation
        const assertionPromise = expect(fetchPromise).rejects.toThrow(PageFetcherError);

        // Run all timers to trigger retries
        await vi.runAllTimersAsync();

        // Wait for the assertion to complete
        await assertionPromise;

        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error if division is not found', async () => {
        await expect(fetcher.getTeams('Unknown Division')).rejects.toThrow('Division "Unknown Division" not found');
    });

    it('should correctly construct URL for getTeamPlayers', async () => {
        const mockResponse = { ok: true, text: () => Promise.resolve('success') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        // Case 1: Base URL without query string
        await fetcher.getTeamPlayers('Division 1', 123);
        expect(fetch).toHaveBeenCalledWith('http://players/div1?stx=&swp=&spp=&t=123');

        // Case 2: Base URL with query string
        const mockDataSourceWithQuery: ActiveSeasonDataSource = {
            ...mockDataSource,
            division_players: [{ 'Division 1': 'http://players/div1?d=9445' }]
        };
        const fetcherWithQuery = new CLTTLActiveSeason2025PagesFetcher(mockDataSourceWithQuery);
        await fetcherWithQuery.getTeamPlayers('Division 1', 456);
        expect(fetch).toHaveBeenCalledWith('http://players/div1?d=9445&stx=&swp=&spp=&t=456');
    });
});
