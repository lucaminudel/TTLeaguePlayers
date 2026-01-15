import { test, expect } from '@playwright/test';
import { CLTTLActiveSeason2025PagesFetcher } from '../../../../../src/service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesFetcher';
import type { ActiveSeasonDataSource } from '../../../../../src/config/environment';

const DATA_SOURCE: ActiveSeasonDataSource = {
    "league": "CLTTL",
    "season": "2025-2026",
    "custom_processor": "CLTTLActiveSeason2025Processor",
    "registrations_start_date": 1755648000,
    "ratings_end_date": 1776124800,
    "division_tables": [
        { "Division 1": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_One" },
        { "Division 2": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_Two" },
        { "Division 3": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_Three" },
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_Four" },
        { "Division 5": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_Five" },
        { "Division 6": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_Six" },
        { "Division 7": "https://www.tabletennis365.com/CentralLondon/Tables/Winter_2025-26/Division_Seven" }
    ],
    "division_fixtures": [
        { "Division 1": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_One" },
        { "Division 2": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_Two" },
        { "Division 3": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_Three" },
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_Four" },
        { "Division 5": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_Five" },
        { "Division 6": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_Six" },
        { "Division 7": "https://www.tabletennis365.com/CentralLondon/Fixtures/Winter_2025-26/Division_Seven" }
    ],
    "division_players": [
        { "Division 1": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_Divisions?d=9445" },
        { "Division 2": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_Divisions?d=9446" },
        { "Division 3": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_Divisions?d=9447" },
        { "Division 4": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_Divisions?d=9448" },
        { "Division 5": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_Divisions?d=9449" },
        { "Division 6": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_ivisions?d=9450" },
        { "Division 7": "https://www.tabletennis365.com/CentralLondon/IndividualAverages/Winter_2025-26/All_Divisions?d=9451" }
    ]
};

test.describe('CLTTLActiveSeason2025PagesFetcher E2E', () => {
    let fetcher: CLTTLActiveSeason2025PagesFetcher;

    test.beforeAll(() => {
        fetcher = new CLTTLActiveSeason2025PagesFetcher(DATA_SOURCE);
    });

    test('getTeams should return HTML containing id="Tables"', async () => {
        test.slow(); // Fetching real pages can be slow
        const html = await fetcher.getTeams('Division 1');
        expect(html).toContain('id="Tables"');
    });

    test('getTeamFixtures should return HTML containing id="Fixtures"', async () => {
        test.slow();
        const html = await fetcher.getTeamFixtures('Division 1');
        expect(html).toContain('id="Fixtures"');
    });

    test('getTeamIds should return HTML containing select#t (id="t")', async () => {
        test.slow();
        const html = await fetcher.getTeamIds('Division 1');
        expect(html).toContain('id="t"');
        expect(html.toLowerCase()).toContain('<select');
    });

    test('getTeamPlayers should return HTML containing id="Averages"', async () => {
        test.slow();
        // Use a likely valid team ID or just check that we get a response with the expected ID
        const html = await fetcher.getTeamPlayers('Division 1', 1);
        expect(html).toContain('id="Averages"');
    });
});
