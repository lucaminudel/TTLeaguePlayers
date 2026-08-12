import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { User, MyClubStandingsPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 15 January 2026 11:01:48 UTC — inside the CLTTL 2025-2026 window.
const FIXED_CLOCK_TIME = '2026-01-15T11:01:48.000Z';

// SHARED with MyClubTeams.spec.ts, declared in scripts/cognito/tests_helpers/register-test-users.sh.
// Safe to share because both specs use it strictly read-only: they log in and never write to
// Cognito. Both of its clubs are named verbatim as in club_teams, which getUrlFromSource requires -
// mocking the response does not help there, because it throws before any request is made.
const MANAGER_EMAIL = 'test_my_club_teams_manager@user.test';
const MANAGER_PASSWORD = 'aA1!56789012';

// HIGHBURY, not Walworth. KudosAwardAndStanding.spec.ts awards kudos to "Walworth Tigers" and
// deletes them in teardown, and spec files run in parallel workers — asserting on Walworth here
// would race with it. Highbury is used by no other spec.
const HIGHBURY_CLUB_URL_FRAGMENT = 'Club/359';

// From the fixture, in club-page order. Nine teams across FIVE divisions, which is what makes this
// club worth using: the fan-out has to reach five different partitions to answer.
const EXPECTED_TEAMS = [
    'Highbury 1', 'Highbury 2', 'Highbury 3', 'Highbury 4', 'Highbury 5',
    'Highbury 6', 'Highbury 7', 'Highbury 8', 'Highbury 9'
];

const fixtureHtml = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data/club_teams_highbury.html'),
    'utf-8'
);

/**
 * Two routes, not one: with avoidCORS the browser issues the PROXY url and carries the league site
 * in a query parameter, so a pattern matching only tabletennis365.com never fires.
 */
async function mockHighburyClubPage(page: Page): Promise<void> {
    const serveFixtureOrContinue = async (route: import('@playwright/test').Route) => {
        if (route.request().url().includes(HIGHBURY_CLUB_URL_FRAGMENT)) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml });
        } else {
            await route.continue();
        }
    };

    await page.route('**/tabletennis365.com/**', serveFixtureOrContinue);
    await page.route('**/go.x2u.in**', serveFixtureOrContinue);
}

test.describe('My Club Standings Page', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

    // No teardown: the page is read-only and this spec creates nothing, in Cognito or DynamoDB.

    test.beforeEach(async ({ page }) => {
        // Load-bearing, not hygiene. Both the club-teams list and the standings response are cached
        // in localStorage for days, so without this a previous run's data is served and the mock
        // never fires. It also clears entries written before getClubTeams changed shape.
        await page.addInitScript(() => {
            localStorage.clear();
            sessionStorage.clear();
        });

        await mockHighburyClubPage(page);
    });

    test('shows every team of the selected club with its kudos match tally', async ({ page }) => {
        const user = new User(page);
        let myClubStandingsPage: MyClubStandingsPage;

        await test.step('Given the club manager is logged in', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);

            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(MANAGER_EMAIL, MANAGER_PASSWORD);
        });

        await test.step('When they open My Club Standings and choose their Islington club', async () => {
            myClubStandingsPage = await user.navigateToMyClubStandings();
            await myClubStandingsPage.selectClub('Islington', 'CLTTL', 'Highbury Table Tennis Club');
        });

        await test.step('Then the league and season are shown', async () => {
            await expect(page.getByTestId('league-season-header')).toHaveText('CLTTL 2025-2026');
        });

        await test.step('And every team from the club page is listed, in the club page order', async () => {
            await expect(page.getByTestId('club-standing-name')).toHaveText(EXPECTED_TEAMS);
        });

        await test.step('And each team shows all three counts', async () => {
            // No kudos exist for any Highbury team, so every count is zero. That is the seeded left
            // join doing its job: without it the table would be EMPTY rather than nine rows of zero,
            // and a manager would see their club as having no teams.
            const zeros = EXPECTED_TEAMS.map(() => '0');

            await expect(page.getByTestId('club-standing-positive')).toHaveText(zeros);
            await expect(page.getByTestId('club-standing-neutral')).toHaveText(zeros);
            await expect(page.getByTestId('club-standing-negative')).toHaveText(zeros);
        });

        await test.step('And the counts are labelled as a match tally, not as kudos', async () => {
            // The pills are told apart by colour and position alone; this header is the only thing
            // on screen saying what the numbers mean.
            await expect(page.getByText('Match Tally')).toBeVisible();
            await expect(page.getByText('Pos', { exact: true })).toBeVisible();
            await expect(page.getByText('Neu', { exact: true })).toBeVisible();
            await expect(page.getByText('Neg', { exact: true })).toBeVisible();
        });
    });

    test('shows an error, and never claims the club has no teams, when the club page cannot be read', async ({ page }) => {
        const user = new User(page);

        await user.setFixedClockTime(FIXED_CLOCK_TIME);

        // Override the fixture route for this test: the club page fails outright.
        await page.route('**/tabletennis365.com/**', (route) => route.abort('failed'));
        await page.route('**/go.x2u.in**', (route) => route.abort('failed'));

        const loginPage = await user.navigateToLogin();
        await loginPage.loginAndWaitForHome(MANAGER_EMAIL, MANAGER_PASSWORD);

        const myClubStandingsPage = await user.navigateToMyClubStandings();
        await myClubStandingsPage.selectClub('Islington', 'CLTTL', 'Highbury Table Tennis Club');

        // Deliberately UNLIKE My Club Teams, which renders blank and logs to the console: a blank
        // standings area is indistinguishable from a club with nothing to show.
        await expect(page.getByTestId('club-standings-error')).toBeVisible();
        await expect(page.getByTestId('club-standing-name')).toHaveCount(0);

        // WORDING: a club with no club_teams entry in the config throws into this same branch, so
        // this message must never assert anything about the club's teams.
        await expect(page.getByText('No teams found for this club.')).toHaveCount(0);
    });
});
