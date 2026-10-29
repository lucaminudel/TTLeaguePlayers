import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLTTLActiveSeason2026PagesFetcher, PageFetcherError } from '../../../../../src/service/league-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { PageFetcherError as TransportPageFetcherError } from '../../../../../src/service/league-season-processors/clttl-2026/PageFetcherError';
import type { ActiveSeasonDataSource } from '../../../../../src/config/environment';

describe('CLTTLActiveSeason2026PagesFetcher', () => {
    const mockDataSource: ActiveSeasonDataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2026Processor',
        custom_club_processor: 'CLTTLManagedClub2026Processor',
        registrations_start_date: 0,
        ratings_end_date: 0,
        division_fixtures: [{ 'Division 1': 'http://fixtures/div1' }],
        division_players: [{ 'Division 1': 'http://players/div1' }],
        club_teams: [{ 'Morpeth Table Tennis Club': 'http://clubs/morpeth' }],
    };

    let fetcher: CLTTLActiveSeason2026PagesFetcher;

    beforeEach(() => {
        vi.useFakeTimers();
        fetcher = new CLTTLActiveSeason2026PagesFetcher(mockDataSource);
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('preserves the shared error constructor at the existing import path', () => {
        expect(PageFetcherError).toBe(TransportPageFetcherError);
    });

    it('forwards browser requests through the shared proxy with the configured fixture URL', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR') } as Response);
        const proxiedFetcher = new CLTTLActiveSeason2026PagesFetcher(mockDataSource, true);

        await proxiedFetcher.getTeamFixtures('Division 1');

        const requestedUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
        expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://go.x2u.in/proxy');
        expect(requestedUrl.searchParams.get('url')).toBe('http://fixtures/div1');
    });

    it('records the actual proxied browser URL in the final request failure', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('network failure'));
        const proxiedFetcher = new CLTTLActiveSeason2026PagesFetcher(mockDataSource, true);
        const result = proxiedFetcher.getTeamPlayers('Division 1', 123).catch((error: unknown) => error);

        await vi.runAllTimersAsync();
        const error = await result;

        expect(error).toBeInstanceOf(PageFetcherError);
        const request = (error as PageFetcherError).details.request;
        expect(request?.url).toBe(vi.mocked(fetch).mock.calls[2][0]);
        expect(new URL(request?.url as string).searchParams.get('apiKey')).toBeTruthy();
        expect(new URL(request?.url as string).searchParams.get('url')).toBe('http://players/div1?handler=Players&leagueId=4760&teamId=123');
    });

    it('retries a stalled HTTP error body and propagates the final failure', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 503,
            statusText: 'Unavailable',
            headers: new Headers(),
            arrayBuffer: () => new Promise<ArrayBuffer>(() => undefined),
        } as unknown as Response);

        const result = fetcher.getTeamFixtures('Division 1').catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(7_000);

        expect(await result).toBeInstanceOf(PageFetcherError);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should successfully fetch content on the first try', async () => {
        const mockResponse = {
            ok: true,
            text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR'),
        };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        const result = await fetcher.getTeamFixtures('Division 1');

        expect(result).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('http://fixtures/div1');
    });

    it('should throw error if division is not found', async () => {
        await expect(fetcher.getTeamFixtures('Unknown Division')).rejects.toThrow('Division "Unknown Division" not found');
    });

    it('should correctly construct the team checker API URL for getTeamPlayers', async () => {
        const mockResponse = { ok: true, text: () => Promise.resolve('success') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        await fetcher.getTeamPlayers('Division 1', 123);
        expect(fetch).toHaveBeenCalledWith('http://players/div1?handler=Players&leagueId=4760&teamId=123');

        await fetcher.getTeamPlayers('Division 1', 456);
        expect(fetch).toHaveBeenLastCalledWith('http://players/div1?handler=Players&leagueId=4760&teamId=456');
    });

    it('should still name the division when a division url is missing', async () => {
        await expect(fetcher.getTeamFixtures('Division 9')).rejects.toThrow(
            'Division "Division 9" not found in data source.'
        );
    });

});
