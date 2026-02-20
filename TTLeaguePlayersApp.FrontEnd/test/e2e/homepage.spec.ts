import { test, expect } from '@playwright/test';
import { User } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

test.describe('Homepage', () => {
    test.beforeEach(async ({ page }) => {
        const userPage = new User(page);
        await userPage.navigateToHome();
    });

    test('should display initial app state and messages', async ({ page }) => {
        // checks that the is the app name: TT League Players
        await expect(page.locator('h1')).toHaveText('TT League Players');

        // checks that the is the welcome message: Welcome
        await expect(page.locator('h2')).toHaveText('Welcome');

        // checks that the is the welcome sub-message
        await expect(page.locator('main')).toContainText("Home of local leagues' Table Tennis players. Starting with the CLTTL");

        // checks that the Enter button is present (use stable test id, not label)
        const enterButton = page.getByTestId('home-enter-button');
        await expect(enterButton).toBeVisible();
    });

    test('when clicking the Ready To Play? button should navigate to the login page for non-loggedin users', async ({ page }) => {
        const user = new User(page);
        const homePage = await user.navigateToHome();

        await homePage.tentativeReadyToPlay();

        // Verify redirect to login page with returnUrl
        await expect(page).toHaveURL(/\/#\/login\?returnUrl=/);
        await expect(page.locator('h2')).toHaveText('Log In');
    });

    test('when clicking the Ready To Play? button an authenticated user should navigate to the kudos page', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        const user = new User(page);

        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        const homePage = await user.navigateToHome();

        await homePage.readyToPlay();
    });

    test.describe('Menu', () => {
        test('when clicking the hamburger menu should show all the menu items for non-loggedin users', async ({ page }) => {
            const user = new User(page);
            await user.menu.open();

            // that all menu items are present and are visiblised in the whole page
            const menuItems = [
                { name: 'Log in', testId: 'main-menu-login-link' },
                { name: 'Home', testId: 'main-menu-nav-home' },
                { name: 'Tournaments & Clubs', testId: 'main-menu-nav-tournaments-&-clubs' },
                { name: 'About', testId: 'main-menu-nav-about' }
            ];

            for (const item of menuItems) {
                const link = page.getByTestId(item.testId);
                await expect(link).toBeVisible();
            }
            // Verify menu items are all centred
            const overlay = page.getByTestId('main-menu-overlay');
            await expect(overlay).toHaveCSS('display', 'flex');
            await expect(overlay).toHaveCSS('flex-direction', 'column');
            await expect(overlay).toHaveCSS('justify-content', 'center');
            await expect(overlay).toHaveCSS('align-items', 'center');
        });

        test('when clicking the hamburger menu an authenticated users should see all the menu items for loggedin users', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new User(page);

            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.menu.open();


            // that all menu items are present and are visiblised in the whole page
            const menuItems = [
                { name: 'Log out', testId: 'main-menu-logout-button' },
                { name: 'Home', testId: 'main-menu-nav-home' },
                { name: 'Kudos', testId: 'main-menu-nav-kudos' },
                { name: 'Kudos Standings', testId: 'main-menu-nav-kudos-standings' },
                { name: 'Forums', testId: 'main-menu-nav-forums' },
                { name: 'About', testId: 'main-menu-nav-about' }
            ];

            for (const item of menuItems) {
                const link = page.getByTestId(item.testId);
                await expect(link).toBeVisible();
            }

            // Verify menu items are all centred
            const overlay = page.getByTestId('main-menu-overlay');
            await expect(overlay).toHaveCSS('display', 'flex');
            await expect(overlay).toHaveCSS('flex-direction', 'column');
            await expect(overlay).toHaveCSS('justify-content', 'center');
            await expect(overlay).toHaveCSS('align-items', 'center');
        });

        test('when clicking the hamburger menu with a logged-in user should show the menu items visible only to logged-in users', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new User(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.menu.open();
            const kudosLink = page.locator('[data-testid="main-menu-nav-kudos"]');
            await expect(kudosLink).toBeVisible();
        });

        test('when clicking the X after opening the menu, it should close the menu', async ({ page }) => {
            const user = new User(page);
            await user.menu.open();

            // Wait for potential animation to stabilize
            await page.waitForTimeout(500);

            // Close the menu
            await user.menu.close();

            // Define overlay for this test's scope
            const overlay = page.getByTestId('main-menu-overlay');

            // Strict Check 1: The overlay container itself must be hidden (opacity-0/pointer-events-none)
            await expect(overlay).toHaveCSS('opacity', '0');
            await expect(overlay).toHaveCSS('pointer-events', 'none');

            // Strict Check 2: Page content must be visible AND actionable (not covered)
            // We check the main page CTA button via a stable test id (not label)
            const enterButton = page.getByTestId('home-enter-button');
            await expect(enterButton).toBeVisible();
            // Trial click ensures the element is not obscured by the overlay
            await enterButton.click({ trial: true });
        });

        test('when clicking Home menu item, a non-loggedin user should navigate to the home page', async ({ page }) => {
            const user = new User(page);
            await user.menu.open();
            await user.menu.navigateToHome();
            await expect(page).toHaveURL(/\/$/);
        });

        test('when clicking Kudos menu item, a loggedin user should navigate to kudos page', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new User(page);

            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.menu.open();

            // Click on Kudos menu item
            const kudosLink = page.getByTestId('main-menu-nav-kudos');
            await kudosLink.click();

            // Verify navigation to kudos page
            await expect(page).toHaveURL(/\/kudos$/);
        });

        test('when clicking Kudos Standings menu item, a loggeing user should navigate to kudos-standings page', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new User(page);

            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.menu.open();

            // Click on Kudos Standings menu item
            const kudosStandingsLink = page.getByTestId('main-menu-nav-kudos-standings');
            await kudosStandingsLink.click();

            // Verify navigation to kudos-standings page
            await expect(page).toHaveURL(/\/kudos-standings$/);
        });

        test('when clicking Tournaments and Clubs menu item, a non-loggedin user should navigate to the tournaments and clubs page', async ({ page }) => {
            const user = new User(page);
            await user.menu.open();
            await user.menu.navigateToTournamentsAndClubs();
            await expect(page).toHaveURL(/\/tournaments-and-clubs$/);
        });

        test('when clicking Forums menu item, a loggedin user should navigate to forums page', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new User(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');
            await user.menu.open();
            await user.menu.navigateToForums();
            await expect(page).toHaveURL(/\/forums$/);
        });

        test('when clicking About menu item, a non-loggedin user should navigate to the about page', async ({ page }) => {
            const user = new User(page);
            await user.menu.open();
            await user.menu.navigateToAbout();
            await expect(page).toHaveURL(/\/about$/);
        });
    });

    test('with invite id in the url should allow to redeem the invite', async ({ page }) => {
        const testInviteId = '6ipEOiGEL6';

        // Mock the API response (same as Join test)
        await page.route('**/invites/*', async (route) => {
            const json = {
                nano_id: testInviteId,
                invitee_name: 'John Doe',
                invitee_email_id: 'john@example.com',
                invitee_role: 'CAPTAIN',
                invitee_team: 'The Smashers',
                team_division: 'Premier',
                league: 'Local League',
                season: 'Winter 2024',
                invited_by: 'Luca',
                accepted_at: null
            };
            await route.fulfill({ json });
        });

        // Navigate to Home page with invite ID
        const user = new User(page);
        const homePage = await user.navigateToHome(testInviteId);

        // Redeem the invite to go to Join page and verify it is is displayed correctly
        await homePage.redeem();

    });
});
