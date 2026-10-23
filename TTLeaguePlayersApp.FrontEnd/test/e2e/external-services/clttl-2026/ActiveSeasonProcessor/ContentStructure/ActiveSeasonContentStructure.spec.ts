import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: Window } };
import { CLTTLActiveSeason2026PagesFetcher } from '../../../../../../src/service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLActiveSeason2026PagesParser } from '../../../../../../src/service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesParser';
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

function readTeamOptions(html: string): { name: string; value: string }[] {
    const dom = new JSDOM(html);
    try {
        return Array.from(dom.window.document.querySelectorAll('select#teamSelect option[value]'))
            .filter(option => option.getAttribute('value') !== '')
            .map(option => ({ name: option.textContent.trim(), value: option.getAttribute('value') ?? '' }));
    } finally {
        dom.window.close();
    }
}

test.describe('CLTTLActiveSeason2026PagesFetcher E2E', () => {
    let fetcher: CLTTLActiveSeason2026PagesFetcher;

    test.beforeAll(() => {
        fetcher = new CLTTLActiveSeason2026PagesFetcher(DATA_SOURCE);
    });

    test('getTeamFixtures returns a calendar the production parser extracts usable fixtures from', async () => {
        test.slow();
        const calendar = await fetcher.getTeamFixtures('Division 4');
        expect(calendar).toContain('BEGIN:VCALENDAR');
        expect(calendar).toContain('BEGIN:VEVENT');
        expect(calendar).toContain('DTSTART');

        const fixtures = new CLTTLActiveSeason2026PagesParser().getTeamFixtures(calendar);
        expect(fixtures.length).toBeGreaterThan(0);
        for (const fixture of fixtures) {
            expect(fixture.startDateTime).toBeInstanceOf(Date);
            expect(Number.isFinite(fixture.startDateTime.getTime())).toBe(true);
            expect(fixture.homeTeam).toMatch(/\S/);
            expect(fixture.awayTeam).toMatch(/\S/);
        }
    });

    test('getTeamIds returns named teams with positive numeric IDs in the live selector', async () => {
        test.slow();
        const html = await fetcher.getTeamIds('Division 4');
        expect(html).toContain('id="teamSelect"');
        expect(html.toLowerCase()).toContain('<select');
        const options = readTeamOptions(html);
        expect(options.length).toBeGreaterThan(0);
        for (const option of options) {
            expect(option.name).toMatch(/\S/);
            expect(option.value).toMatch(/^[1-9]\d*$/);
            expect(Number.isSafeInteger(Number(option.value))).toBe(true);
        }
        expect(options.some(option => option.name === 'Morpeth 10')).toBe(true);
    });

    test('getTeamPlayers returns named registered players for the current selector-derived Morpeth 10 ID', async () => {
        test.slow();
        const options = readTeamOptions(await fetcher.getTeamIds('Division 4'));
        const team = options.find(option => option.name === 'Morpeth 10');
        expect(team).toBeDefined();
        const teamId = Number(team?.value);
        expect(Number.isSafeInteger(teamId)).toBe(true);
        expect(teamId).toBeGreaterThan(0);
        const response = await fetcher.getTeamPlayers('Division 4', teamId);
        const roster = JSON.parse(response) as { teamPlayers: { id: unknown; name: unknown }[] };
        expect(Array.isArray(roster.teamPlayers)).toBe(true);
        expect(roster.teamPlayers.length).toBeGreaterThan(0);
        for (const player of roster.teamPlayers) {
            expect(player.name).toEqual(expect.any(String));
            expect(player.name).toMatch(/\S/);
            expect(Number.isSafeInteger(player.id)).toBe(true);
            expect(player.id).toBeGreaterThan(0);
        }
    });

});
