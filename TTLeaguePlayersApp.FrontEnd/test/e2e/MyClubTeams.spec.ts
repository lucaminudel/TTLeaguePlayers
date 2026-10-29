import { stubbedTest as test, expect } from './helpers/tabletennis365-test-setup';
import { User, MyClubTeamsPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 16 October 2026 20:46 UTC — inside the CLTTL 2026-2027 window.
const FIXED_CLOCK_TIME = '2026-10-16T20:46:00.000Z';

// This user is declared in scripts/cognito/tests_helpers/register-test-users.sh and owned by this
// spec. Both of its clubs are named verbatim as in club_teams, which getUrlFromSource requires -
// mocking the response does not help there, because it throws before any request is made.
const MANAGER_EMAIL = 'test_my_club_teams_manager@user.test';
const MANAGER_PASSWORD = 'aA1!56789012';

const WALWORTH_CLUB_URL = 'https://www.tabletennis365.com/CentralLondon/Clubs/TSPxHAtVSl';
// From the fixture, in club-page order (the page lists teams by division, not alphabetically).
const EXPECTED_TEAMS = ['Walworth Gainsford', 'Walworth Enigma', 'Walworth Tigers', 'Walworth Wonderers'];

test.describe('My Club Teams Page', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

    // No teardown: the page is read-only and this spec creates nothing.

    test.beforeEach(async ({ page }) => {
        // Load-bearing, not hygiene. Both the club-teams list and the registrations response are
        // cached in localStorage for days, so without this a previous run's data is served and the
        // mock never fires.
        await page.addInitScript(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
    });

    test('shows every team of the selected club with its registration status', async ({ page }) => {
        const user = new User(page);
        let myClubTeamsPage: MyClubTeamsPage;

        await test.step('Given the club manager is logged in', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);

            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(MANAGER_EMAIL, MANAGER_PASSWORD);
        });

        await test.step('When they open My Club Teams and choose their London club', async () => {
            myClubTeamsPage = await user.navigateToMyClubTeams();
            await myClubTeamsPage.selectClub('London', 'CLTTL', 'Walworth Table Tennis Club');
        });

        await test.step('Then the league and season are shown', async () => {
            await expect(page.getByTestId('league-season-header')).toHaveText('CLTTL 2026-2027');
        });

        await test.step('And every team from the club page is listed, in the club page order', async () => {
            await expect(page.getByTestId('club-team-name')).toHaveText(EXPECTED_TEAMS);
        });

        await test.step('And each team shows a status, with no invite details when not invited', async () => {
            const statuses = page.getByTestId('club-team-status');
            await expect(statuses).toHaveCount(EXPECTED_TEAMS.length);

            // No captain invites exist for these teams, so the left join reports every one of them
            // as not invited - and a NOT_INVITED row carries neither a date nor an invitee.
            await expect(statuses).toHaveText(EXPECTED_TEAMS.map(() => 'Not invited'));
            await expect(page.getByTestId('club-team-date')).toHaveText(EXPECTED_TEAMS.map(() => ''));
            await expect(page.getByTestId('club-team-invitee')).toHaveText(EXPECTED_TEAMS.map(() => ''));
        });

        await test.step('And every row leaves room for the future invite icons', async () => {
            await expect(page.getByTestId('club-team-actions')).toHaveCount(EXPECTED_TEAMS.length);
        });
    });

    test('shows a loading error and reports a failed club request', async ({ page, tableTennis365Stub }) => {
        const user = new User(page);

        await user.setFixedClockTime(FIXED_CLOCK_TIME);

        tableTennis365Stub.clubs.failWithNetworkError(WALWORTH_CLUB_URL);

        const loginPage = await user.navigateToLogin();
        await loginPage.loginAndWaitForHome(MANAGER_EMAIL, MANAGER_PASSWORD);

        const myClubTeamsPage = await user.navigateToMyClubTeams();
        const diagnostic = page.waitForResponse(response => response.url().endsWith('/frontend-events') && response.request().method() === 'POST');
        await myClubTeamsPage.selectClub('London', 'CLTTL', 'Walworth Table Tennis Club');
        const response = await diagnostic;
        expect(response.status()).toBe(204);
        const body = response.request().postDataJSON() as { event_category: string; client_api_type: string; operation: string };
        expect(body.event_category).toBe('FRONTEND_API_CALL_ERROR');
        expect(body.client_api_type).toBe('TT365');
        expect(body.operation).toBe('getClubTeams');
        await expect(page.getByTestId('club-teams-error')).toHaveText('The teams for this club could not be loaded. Please retry again later. If the problem persists, contact us.');
        await expect(page.getByTestId('club-team-name')).toHaveCount(0);
        await expect(page.getByText('No teams found for this club.')).toHaveCount(0);
    });
    for (const useStaleCache of [false, true]) {
        test(`reports a complete parsing failure with ${useStaleCache ? 'stale' : 'no'} cache`, async ({ page, tableTennis365Stub }) => {
            const user = new User(page);
            await user.setFixedClockTime(FIXED_CLOCK_TIME);
            tableTennis365Stub.setResponse(WALWORTH_CLUB_URL, { status: 200, contentType: 'text/html', body: '<html><body>invalid club page</body></html>' });
            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(MANAGER_EMAIL, MANAGER_PASSWORD);
            const cacheKey = 'cache_club_CLTTL_2026-2027_London_Walworth Table Tennis Club';
            const entry = { timestamp: Date.parse(FIXED_CLOCK_TIME) - 2 * 24 * 60 * 60 * 1000, data: [{ team_name: 'Walworth Tigers', team_division: 'Division 4' }] };
            if (useStaleCache) await page.evaluate(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); }, { key: cacheKey, value: entry });
            const myClubTeamsPage = await user.navigateToMyClubTeams();
            const diagnostic = page.waitForResponse(response => response.url().endsWith('/frontend-events') && response.request().method() === 'POST');
            await myClubTeamsPage.selectClub('London', 'CLTTL', 'Walworth Table Tennis Club');
            const response = await diagnostic;
            expect(response.status()).toBe(204);
            const body = response.request().postDataJSON() as { event_category: string };
            expect(body.event_category).toBe(useStaleCache ? 'FRONTEND_API_CALL_IRREGULAR' : 'FRONTEND_API_CALL_ERROR');
            if (useStaleCache) {
                await expect(page.getByTestId('club-team-name')).toHaveText(['Walworth Tigers']);
                expect(await page.evaluate(key => localStorage.getItem(key), cacheKey)).toBe(JSON.stringify(entry));
            } else {
                await expect(page.getByTestId('club-teams-error')).toBeVisible();
                expect(await page.evaluate(key => localStorage.getItem(key), cacheKey)).toBeNull();
            }
        });
    }

});
