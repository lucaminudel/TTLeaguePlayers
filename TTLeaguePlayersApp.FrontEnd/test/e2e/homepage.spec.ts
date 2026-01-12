import { test, expect } from '@playwright/test';
import { User } from './page-objects/User';

test.describe('Homepage', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
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

    test.describe('Menu', () => {
        test('when clicking the hamburger menu should show all the menu items for non-loggedin users', async ({ page }) => {
            const user = new User(page);
            await user.menu.open();

            // that all menu items are present and are visiblised in the whole page
            const menuItems = [
                { name: 'Log in', testId: 'main-menu-login-link' },
                { name: 'Kudos Standings', testId: 'main-menu-nav-kudos-standings' },
                { name: 'Tournaments & Clubs', testId: 'main-menu-nav-tournaments-&-clubs' },
                { name: 'Forums', testId: 'main-menu-nav-forums' }
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

        test('when clicking the hamburger menu with a logged-in user should show the menu items visible only to logged-in users', async ({ page }) => {
            const user = new User(page);
            const loginPage = await user.navigateToLogin();
            await loginPage.login('test_already_registered@user.test', 'aA1!56789012');

            // Verify redirect to homepage
            await expect(page).toHaveURL('/#/');

            await user.menu.open();

            // Verify logged-in specific menu items are visible: Log out and Kudos
            const logoutButton = page.getByTestId('main-menu-logout-button');
            await expect(logoutButton).toBeVisible();

            const kudosLink = page.locator('[data-testid="main-menu-nav-kudos"]');
            await expect(kudosLink).toBeVisible();
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
        await page.goto(`/#/${testInviteId}`);

        // Check that we're still on the Home page
        await expect(page.locator('h2')).toHaveText('Welcome');

        // Check that the button shows "Redeem your invite" instead of "Ready to play?"
        const enterButton = page.getByTestId('home-enter-button');
        await expect(enterButton).toHaveText('Redeem your invite');
        await expect(enterButton).toBeVisible();

        // Click the button to navigate to Join page
        await enterButton.click();

        // Verify navigation to Join page with correct invite ID
        await expect(page).toHaveURL(`/#/join/${testInviteId}`);
        await expect(page.locator('h2')).toHaveText('Join - Personal Invite');

        // Verify the Register button is active (not disabled)
        const registerButton = page.getByTestId('join-register-button');
        await expect(registerButton).toBeVisible();
        await expect(registerButton).toBeEnabled();
    });
});
