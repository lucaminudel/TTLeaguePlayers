import { test, expect } from '@playwright/test';
import { CLTTLActiveSeason2026PagesFetcher } from '../../../../../src/service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import type { ActiveSeasonDataSource } from '../../../../../src/config/environment';

// A copy of the active CLTTL 2026-2027 source. This spec runs in Node, which has no CORS, so the
// fetcher goes to the league site directly. Calendar parsing stays in Vitest because Node has no
// DOMParser; this spec verifies the raw upstream contracts only.
const DATA_SOURCE: ActiveSeasonDataSource = {
    "league": "CLTTL",
    "season": "2026-2027",
    "custom_processor": "CLTTLActiveSeason2026Processor",
    "custom_club_processor": "CLTTLManagedClub2025Processor",
    "registrations_start_date": 1788220800,
    "ratings_end_date": 1814400000,
    "division_tables": [
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202026-27&divisionName=Division%20Four" }
    ],
    "division_fixtures": [
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Fixtures/calendar.ics?d=9761" }
    ],
    "division_players": [
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" }
    ],
    "club_teams": [
        { "Morpeth Table Tennis Club": "https://www.tabletennis365.com/CentralLondon/Clubs/Morpeth" }
    ]
};

// Morpeth 10's team id in Winter 2026-27, as listed by the team checker page's select#teamSelect.
const MORPETH_10_TEAM_ID = 73142;

test.describe('CLTTLActiveSeason2026PagesFetcher E2E', () => {
    let fetcher: CLTTLActiveSeason2026PagesFetcher;

    test.beforeAll(() => {
        fetcher = new CLTTLActiveSeason2026PagesFetcher(DATA_SOURCE);
    });

    test('getTeams should return HTML containing the league table', async () => {
        test.slow(); // Fetching real pages can be slow
        const html = await fetcher.getTeams('Division 4');
        expect(html).toContain('tt-league-table');
    });

    test('getTeamFixtures should return a non-empty fixtures calendar', async () => {
        test.slow();
        const calendar = await fetcher.getTeamFixtures('Division 4');
        expect(calendar).toContain('BEGIN:VCALENDAR');
        expect(calendar).toContain('BEGIN:VEVENT');
        expect(calendar).toContain('DTSTART');
    });

    test('getTeamIds should return HTML containing the team checker selector', async () => {
        test.slow();
        const html = await fetcher.getTeamIds('Division 4');
        expect(html).toContain('id="teamSelect"');
        expect(html.toLowerCase()).toContain('<select');
    });

    test('getTeamPlayers should return a non-empty team checker API response', async () => {
        test.slow();
        const response = await fetcher.getTeamPlayers('Division 4', MORPETH_10_TEAM_ID);
        expect(response.trim()).not.toBe('');
    });

    test('getClubTeams should return HTML containing the club teams table', async () => {
        test.slow();
        const html = await fetcher.getClubTeams('Morpeth Table Tennis Club');
        expect(html).toContain('tt-contact-table');
    });
});
