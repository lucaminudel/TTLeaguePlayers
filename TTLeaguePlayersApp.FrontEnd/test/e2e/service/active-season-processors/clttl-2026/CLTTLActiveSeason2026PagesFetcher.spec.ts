import { test, expect } from '@playwright/test';
import { CLTTLActiveSeason2026PagesFetcher } from '../../../../../src/service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import type { ActiveSeasonDataSource } from '../../../../../src/config/environment';

// A copy of the CLTTL 2025-2026 entry of config/*.env.json: the pages the app really fetches. This
// spec runs in Node, which has no CORS, so the fetcher goes to the league site directly (no proxy).
// The parser is not exercised here - Node has no DOMParser - only that each page still carries the
// anchor the parser is written against. The parsing itself is covered by the Vitest snapshots.
const DATA_SOURCE: ActiveSeasonDataSource = {
    "league": "CLTTL",
    "season": "2025-2026",
    "custom_processor": "CLTTLActiveSeason2026Processor",
    "custom_club_processor": "CLTTLManagedClub2025Processor",
    "registrations_start_date": 1755648000,
    "ratings_end_date": 1776124800,
    "division_tables": [
        { "Division 1": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20One" },
        { "Division 2": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20Two" },
        { "Division 3": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20Three" },
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20Four" },
        { "Division 5": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20Five" },
        { "Division 6": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20Six" },
        { "Division 7": "https://www.tabletennis365.com/CentralLondon/Tables?leagueName=Winter%202025-26&divisionName=Division%20Seven" }
    ],
    "division_fixtures": [
        { "Division 1": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20One&vm=2" },
        { "Division 2": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20Two&vm=2" },
        { "Division 3": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20Three&vm=2" },
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20Four&vm=2" },
        { "Division 5": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20Five&vm=2" },
        { "Division 6": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20Six&vm=2" },
        { "Division 7": "https://www.tabletennis365.com/CentralLondon/Fixtures?leagueName=Winter%202025-26&divisionName=Division%20Seven&vm=2" }
    ],
    "division_players": [
        { "Division 1": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" },
        { "Division 2": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" },
        { "Division 3": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" },
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" },
        { "Division 5": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" },
        { "Division 6": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" },
        { "Division 7": "https://www.tabletennis365.com/CentralLondon/Team/Eligibility" }
    ],
    "club_teams": [
        { "Morpeth Table Tennis Club": "https://www.tabletennis365.com/CentralLondon/Clubs/Morpeth" }
    ]
};

// Morpeth 10's team id in Winter 2025-26, as listed by the team checker page's select#teamSelect.
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

    test('getTeamFixtures should return HTML containing the fixtures table', async () => {
        test.slow();
        const html = await fetcher.getTeamFixtures('Division 4');
        expect(html).toContain('tt-fixture-table');
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
