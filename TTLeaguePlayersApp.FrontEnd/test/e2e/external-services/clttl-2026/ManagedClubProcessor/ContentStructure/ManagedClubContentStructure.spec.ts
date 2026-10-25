import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: Window } };
import { CLTTLManagedClub2026PagesFetcher } from '../../../../../../src/service/league-season-processors/clttl-2026/CLTTLManagedClub2026PagesFetcher';
import type { ActiveSeasonDataSource } from '../../../../../../src/config/environment';

// Node fetches the league site directly; these checks isolate upstream structure from the browser/proxy path.
const DATA_SOURCE: ActiveSeasonDataSource = {
    "league": "CLTTL",
    "season": "2026-2027",
    "custom_processor": "CLTTLActiveSeason2026Processor",
    "custom_club_processor": "CLTTLManagedClub2026Processor",
    "registrations_start_date": 1788220800,
    "ratings_end_date": 1814400000,
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

test.describe('CLTTL managed-club content structure', () => {
    test('getClubTeams returns club team rows with meaningful names and divisions', async () => {
        test.slow();
        const clubFetcher = new CLTTLManagedClub2026PagesFetcher(DATA_SOURCE);
        const html = await clubFetcher.getClubTeams('Morpeth Table Tennis Club');
        expect(html).toContain('tt-contact-table');
        const dom = new JSDOM(html);
        try {
            const rows = Array.from(dom.window.document.querySelectorAll('table.tt-contact-table tbody tr'));
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                expect(cells.length).toBeGreaterThanOrEqual(3);
                expect(cells[1].textContent).toMatch(/\S/);
                expect(cells[2].textContent).toMatch(/\S/);
            }
        } finally {
            dom.window.close();
        }
    });
});
