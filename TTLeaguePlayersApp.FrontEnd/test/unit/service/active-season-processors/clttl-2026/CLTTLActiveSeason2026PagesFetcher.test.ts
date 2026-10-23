import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLTTLActiveSeason2026PagesFetcher, PageFetcherError } from '../../../../../src/service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { PageFetcherError as TransportPageFetcherError } from '../../../../../src/service/active-season-processors/clttl-2026/PageFetcherError';
import type { ActiveSeasonDataSource } from '../../../../../src/config/environment';

describe('CLTTLActiveSeason2026PagesFetcher', () => {
    const mockDataSource: ActiveSeasonDataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2026Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
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
