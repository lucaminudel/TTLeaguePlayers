import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { User, MyClubTeamsPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 15 January 2026 11:01:48 UTC — inside the CLTTL 2025-2026 window.
const FIXED_CLOCK_TIME = '2026-01-15T11:01:48.000Z';

// This user is declared in scripts/cognito/tests_helpers/register-test-users.sh and owned by this
// spec. Both of its clubs are named verbatim as in club_teams, which getUrlFromSource requires -
// mocking the response does not help there, because it throws before any request is made.
const MANAGER_EMAIL = 'test_my_club_teams_manager@user.test';
const MANAGER_PASSWORD = 'aA1!56789012';

// Walworth's entry in club_teams. The club page is MOCKED because a club's team list genuinely
// changes over time, unlike the historic pages the other specs fetch for real. The parser's contract
// against the live site is covered by the processor's own integration tests.
const WALWORTH_CLUB_URL_FRAGMENT = 'Club/6008';
const EXPECTED_TEAMS = ['Walworth Enigma', 'Walworth Gainsford', 'Walworth Tigers', 'Walworth Wonderers'];

const fixtureHtml = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data/club_teams_walworth.html'),
    'utf-8'
);

/**
 * Two routes, not one: with avoidCORS the browser issues the PROXY url and carries the league site
 * in a query parameter, so a pattern matching only tabletennis365.com never fires.
 */
async function mockWalworthClubPage(page: Page): Promise<void> {
    const serveFixtureOrContinue = async (route: import('@playwright/test').Route) => {
        if (route.request().url().includes(WALWORTH_CLUB_URL_FRAGMENT)) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml });
        } else {
            await route.continue();
        }
    };

    await page.route('**/tabletennis365.com/**', serveFixtureOrContinue);
    await page.route('**/go.x2u.in**', serveFixtureOrContinue);
}

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

        await mockWalworthClubPage(page);
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
            await expect(page.getByTestId('league-season-header')).toHaveText('CLTTL 2025-2026');
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

    test('shows a blank list, and no teams message, when the club page cannot be read', async ({ page }) => {
        const user = new User(page);

        await user.setFixedClockTime(FIXED_CLOCK_TIME);

        // Override the fixture route for this test: the club page fails outright.
        await page.route('**/tabletennis365.com/**', (route) => route.abort('failed'));
        await page.route('**/go.x2u.in**', (route) => route.abort('failed'));

        const loginPage = await user.navigateToLogin();
        await loginPage.loginAndWaitForHome(MANAGER_EMAIL, MANAGER_PASSWORD);

        const myClubTeamsPage = await user.navigateToMyClubTeams();
        await myClubTeamsPage.selectClub('London', 'CLTTL', 'Walworth Table Tennis Club');

        // Errors are console-only by design: the area renders blank, and the "no teams" sentence is
        // deliberately NOT shown, so a failed load cannot be mistaken for a club with no teams.
        await expect(page.getByTestId('club-team-name')).toHaveCount(0);
        await expect(page.getByText('No teams found for this club.')).toHaveCount(0);
    });
});
