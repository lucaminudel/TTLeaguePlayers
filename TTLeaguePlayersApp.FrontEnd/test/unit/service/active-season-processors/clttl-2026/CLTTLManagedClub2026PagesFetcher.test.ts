import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLTTLManagedClub2026PagesFetcher } from '../../../../../src/service/active-season-processors/clttl-2026/CLTTLManagedClub2026PagesFetcher';
import type { ActiveSeasonDataSource } from '../../../../../src/config/environment';

describe('CLTTLManagedClub2026PagesFetcher', () => {
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

    let clubFetcher: CLTTLManagedClub2026PagesFetcher;

    beforeEach(() => {
        vi.useFakeTimers();
        clubFetcher = new CLTTLManagedClub2026PagesFetcher(mockDataSource);
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('forwards browser requests through the shared proxy with the exact configured club URL', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: true, text: () => Promise.resolve('<html>Teams</html>') } as Response);
        const proxiedFetcher = new CLTTLManagedClub2026PagesFetcher(mockDataSource, true);

        await proxiedFetcher.getClubTeams('Morpeth Table Tennis Club');

        const requestedUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
        expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://go.x2u.in/proxy');
        expect(requestedUrl.searchParams.get('url')).toBe('http://clubs/morpeth');
    });

    it.each(['toString', 'Empty Club'])('rejects an inherited or empty URL for %s before fetching', async (club) => {
        const source = { ...mockDataSource, club_teams: [{ 'Empty Club': '' }] };
        const invalidClubFetcher = new CLTTLManagedClub2026PagesFetcher(source);

        await expect(invalidClubFetcher.getClubTeams(club)).rejects.toThrow(`Club "${club}" not found in data source.`);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should fetch the club page from the url configured for that club', async () => {
        const mockResponse = { ok: true, text: () => Promise.resolve('<html>Teams</html>') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        const result = await clubFetcher.getClubTeams('Morpeth Table Tennis Club');

        expect(result).toBe('<html>Teams</html>');
        expect(fetch).toHaveBeenCalledWith('http://clubs/morpeth');
    });

    it('should throw error if the club has no url configured', async () => {
        await expect(clubFetcher.getClubTeams('Apex Table Tennis Club')).rejects.toThrow(
            'Club "Apex Table Tennis Club" not found in data source.'
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should throw error if the league has no clubs configured', async () => {
        const mockDataSourceWithoutClubs: ActiveSeasonDataSource = {
            ...mockDataSource,
            league: 'BCS',
            club_teams: []
        };
        const fetcherWithoutClubs = new CLTTLManagedClub2026PagesFetcher(mockDataSourceWithoutClubs);

        await expect(fetcherWithoutClubs.getClubTeams('Morpeth Table Tennis Club')).rejects.toThrow(
            'Club "Morpeth Table Tennis Club" not found in data source.'
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should retry the club page like the other pages', async () => {
        const failResponse = { ok: false, status: 500 };
        vi.mocked(fetch).mockResolvedValue(failResponse as Response);

        const fetchPromise = clubFetcher.getClubTeams('Morpeth Table Tennis Club');
        const assertionPromise = expect(fetchPromise).rejects.toThrow('The page or website is not available after 3 attempts');

        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(2000);
        await assertionPromise;

        expect(fetch).toHaveBeenCalledTimes(3);
    });

});
