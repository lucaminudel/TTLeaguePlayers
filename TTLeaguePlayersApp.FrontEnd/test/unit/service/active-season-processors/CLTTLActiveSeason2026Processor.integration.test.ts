import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLTTLActiveSeason2026Processor } from '../../../../src/service/active-season-processors/CLTTLActiveSeason2026Processor';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';

describe('CLTTLActiveSeason2026Processor Integration', () => {
    const mockDataSource: ActiveSeasonDataSource = {
        league: 'CLTTL',
        season: '2026-2027',
        custom_processor: 'CLTTLActiveSeason2026Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: 0,
        ratings_end_date: 0,
        division_fixtures: [{ 'Division 1': 'http://fixtures/div1-calendar' }],
        division_players: [{ 'Division 1': 'http://players/div1' }],
        club_teams: [],
    };

    let processor: CLTTLActiveSeason2026Processor;

    beforeEach(() => {
        processor = new CLTTLActiveSeason2026Processor(mockDataSource, 'Division 1', 'Morpeth 10');
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('should successfully get fixtures, filtered by team and sorted by date', async () => {
        const fixtureEvent = (dateTime: string, summary: string) => [
            'BEGIN:VEVENT',
            `DTSTART;TZID=Europe/London:${dateTime}`,
            `SUMMARY:${summary} (Division 1)`,
            'LOCATION:Somewhere, London',
            'END:VEVENT'
        ].join('\n');
        const mockCalendar = [
            'BEGIN:VCALENDAR',
            fixtureEvent('20261005T193000', 'Fusion 5 v Morpeth 10'),
            fixtureEvent('20260929T193000', 'Morpeth 10 v Fusion 6 Jr'),
            fixtureEvent('20261001T190000', 'Apex 4 v Irving 4'),
            'END:VCALENDAR'
        ].join('\n');
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockCalendar),
        } as Response);

        const fixtures = await processor.getTeamFixtures();

        expect(fixtures.length).toBe(2);
        expect(fixtures[0].startDateTime.toISOString()).toContain('2026-09-29');
        expect(fixtures[0].homeTeam).toBe('Morpeth 10');
        expect(fixtures[1].startDateTime.toISOString()).toContain('2026-10-05');
        expect(fixtures[1].awayTeam).toBe('Morpeth 10');
        expect(fetch).toHaveBeenCalledWith('http://fixtures/div1-calendar');
    });

    it('should successfully get team players', async () => {
        const mockTeamCheckerHtml = '<select id="teamSelect"><option value="">-- Select Team --</option><option value="73142">Morpeth 10</option></select>';
        const mockTeamPlayersApiResponse = JSON.stringify({
            teamPlayers: [{ name: 'Luca Minudel' }],
            otherPlayers: [{ name: 'Other Eligible Player' }]
        });

        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockTeamCheckerHtml),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockTeamPlayersApiResponse),
            } as Response);

        const players = await processor.getTeamPlayers();
        expect(players).toEqual(['Luca Minudel']);
        expect(fetch).toHaveBeenCalledTimes(2);
        // Verify URL construction for the team checker API
        expect(fetch).toHaveBeenLastCalledWith('http://players/div1?handler=Players&leagueId=4760&teamId=73142');
    });

    it('should throw error if team is not found in division', async () => {
        const mockTeamCheckerHtml = '<select id="teamSelect"><option value="123">Other Team</option></select>';
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockTeamCheckerHtml),
        } as Response);

        await expect(processor.getTeamPlayers()).rejects.toThrow('Team "Morpeth 10" not found in division "Division 1".');
    });

    it('should bubble up PageFetcherError when page is not reachable', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 404,
        } as Response);

        // Fetcher retries 3 times (1 initial + 2 retries)
        await expect(processor.getTeamFixtures()).rejects.toThrow('The page or website is not available after 3 attempts');
        expect(fetch).toHaveBeenCalledTimes(3);
    });
});
