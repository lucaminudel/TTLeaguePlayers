import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLTTLActiveSeason2025Processor } from '../../../../src/service/active-season-processors/CLTTLActiveSeason2025Processor';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';

describe('CLTTLActiveSeason2025Processor Integration', () => {
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

    let processor: CLTTLActiveSeason2025Processor;

    beforeEach(() => {
        processor = new CLTTLActiveSeason2025Processor(mockDataSource, 'Division 1', 'Morpeth 10');
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('should successfully get teams', async () => {
        const mockHtml = '<div id="Tables"><table><td class="teamName"><span class="visible-xs"><a>Morpeth 10</a></span></td></table></div>';
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockHtml),
        } as Response);

        const teams = await processor.getTeams();
        expect(teams).toEqual(['Morpeth 10']);
        expect(fetch).toHaveBeenCalledWith('http://tables/div1');
    });

    it('should successfully get fixtures, filtered by team and sorted by date', async () => {
        const mockHtml = `
            <div id="Fixtures">
                <!-- Fixture 1: Later date, matches team -->
                <div class="fixture complete">
                    <div class="date" itemprop="startDate">
                        <time datetime="2025-10-05">Sun 05 Oct 19:30</time>
                    </div>
                    <div class="homeTeam">
                        <div class="teamName">Fusion 5</div>
                    </div>
                    <div class="awayTeam">
                        <div class="teamName">Morpeth 10</div>
                    </div>
                </div>
                <!-- Fixture 2: Earlier date, matches team -->
                <div class="fixture complete">
                    <div class="date" itemprop="startDate">
                        <time datetime="2025-09-29">Mon 29 Sep 19:30</time>
                    </div>
                    <div class="homeTeam">
                        <div class="teamName">Morpeth 10</div>
                    </div>
                    <div class="awayTeam">
                        <div class="teamName">Fusion 6 Jr</div>
                    </div>
                </div>
                <!-- Fixture 3: Doesn't match team -->
                <div class="fixture complete">
                    <div class="date" itemprop="startDate">
                        <time datetime="2025-10-01">Wed 01 Oct 19:00</time>
                    </div>
                    <div class="homeTeam">
                        <div class="teamName">Apex 4</div>
                    </div>
                    <div class="awayTeam">
                        <div class="teamName">Irving 4</div>
                    </div>
                </div>
            </div>`;
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockHtml),
        } as Response);

        const fixtures = await processor.getTeamFixtures();

        // Should only have 2 fixtures (Morpeth 10)
        expect(fixtures.length).toBe(2);

        // Should be sorted by date: Sep 29 first, then Oct 05
        expect(fixtures[0].startDateTime.toISOString()).toContain('2025-09-29');
        expect(fixtures[0].homeTeam).toBe('Morpeth 10');

        expect(fixtures[1].startDateTime.toISOString()).toContain('2025-10-05');
        expect(fixtures[1].awayTeam).toBe('Morpeth 10');
    });

    it('should successfully get team players', async () => {
        const mockAllPlayersHtml = '<select id="t"><option value="73142">Morpeth 10</option></select>';
        const mockTeamPlayersHtml = '<div id="Averages"><a title="View player statistics">Luca Minudel</a></div>';

        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockAllPlayersHtml),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockTeamPlayersHtml),
            } as Response);

        const players = await processor.getTeamPlayers();
        expect(players).toEqual(['Luca Minudel']);
        expect(fetch).toHaveBeenCalledTimes(2);
        // Verify URL construction for players page
        expect(fetch).toHaveBeenLastCalledWith('http://players/div1?stx=&swp=&spp=&t=73142');
    });

    it('should throw error if team is not found in division', async () => {
        const mockAllPlayersHtml = '<select id="t"><option value="123">Other Team</option></select>';
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockAllPlayersHtml),
        } as Response);

        await expect(processor.getTeamPlayers()).rejects.toThrow('Team "Morpeth 10" not found in division "Division 1".');
    });

    it('should bubble up PageFetcherError when page is not reachable', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 404,
        } as Response);

        // Fetcher retries 3 times (1 initial + 2 retries)
        await expect(processor.getTeams()).rejects.toThrow('The page or website is not available after 3 attempts');
        expect(fetch).toHaveBeenCalledTimes(3);
    });
});
