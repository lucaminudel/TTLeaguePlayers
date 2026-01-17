import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { User as UserFlow, LoginPage, RegisterPage } from './page-objects/User';

/**
 * Helper function to set a fixed clock time for testing time-dependent behavior.
 * @param page - The Playwright page object
 * @param dateTime - ISO 8601 date-time string (e.g., '2026-01-16T15:26:00Z')
 */
async function setFixedClockTime(page: Page, dateTime: string): Promise<void> {
    await page.addInitScript((time) => {
        window.__FIXED_CLOCK_TIME__ = time;
    }, dateTime);
}

test.describe('Kudos', () => {
    test.describe('authenticated users only page, login - logout flows', () => {
        test('when a non logged-in user tries to navigate to kudos, it redirects to login and after successful login it redirects back to kudos', async ({ page }) => {
            const userPage = new UserFlow(page);

            // Navigate to kudos page
            await userPage.tentativelyNavigateToKudos();

            // Verify redirect to login page
            await expect(page).toHaveURL('/#/login?returnUrl=%2Fkudos');
            await expect(page.locator('h2')).toHaveText('Log In');

            // Fill in login credentials manually
            const loginPage = new LoginPage(page);
            await loginPage.tryToLogin('test_already_registered@user.test', 'aA1!56789012');

            // Verify redirect back to kudos page after successful login
            await expect(page).toHaveURL('/#/kudos');
            await expect(page.locator('h2')).toHaveText('Fair play Kudos');
        });

        test('when a non logged-in user tries to login with unverified email, it is redirected through verification with returnUrl preserved', async ({ page }) => {
            // Mock InitiateAuth to return UserNotConfirmedException
            await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
                const request = route.request();
                const headers = request.headers();
                const target = headers['x-amz-target'] as string | undefined;

                if (target?.endsWith('.InitiateAuth')) {
                    await route.fulfill({
                        status: 400,
                        contentType: 'application/x-amz-json-1.1',
                        body: JSON.stringify({
                            __type: 'UserNotConfirmedException',
                            message: 'User is not confirmed.'
                        })
                    });
                    return;
                }

                // Mock ConfirmSignUp (email verification)
                if (target?.endsWith('.ConfirmSignUp')) {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/x-amz-json-1.1',
                        body: JSON.stringify({})
                    });
                    return;
                }

                await route.continue();
            });

            // Navigate to kudos page
            const userPage = new UserFlow(page);
            await userPage.tentativelyNavigateToKudos();

            // Verify redirect to login page with returnUrl
            await expect(page).toHaveURL('/#/login?returnUrl=%2Fkudos');

            // Fill in login credentials for unverified user
            const loginPage = new LoginPage(page);
            await loginPage.tryToLogin('unverified_user@user.test', 'aA1!56789012');

            // Verify redirect to register page with verify=true and returnUrl preserved
            await expect(page).toHaveURL('/#/register?email=unverified_user%40user.test&verify=true&returnUrl=%2Fkudos');
            await expect(page.locator('h2')).toHaveText('Verify Email');

            // Enter verification code
            const registerPage = new RegisterPage(page);
            await registerPage.tentativelyVerifyUserEmail('123456');

            // Verify redirect back to login with returnUrl preserved
            await expect(page).toHaveURL('/#/login?returnUrl=%2Fkudos');
        });

        test('when user logs out from an authenticated-users only page like kudos, user is redirected to home', async ({ page }) => {
            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            // Navigate to kudos page
            await user.navigateToKudos();

            // Logout that includes Verify redirected to home
            await user.menu.open();
            await user.menu.logout();

            // Verify logged out (menu shows Login item)
            await user.menu.open();
            await expect(page.getByTestId('main-menu-login-link')).toBeVisible();
        });
    });
    test.describe('active season cards', () => {

        test('shows previous and current match for all active seasons', async ({ page }) => {
            // Set fixed clock time to Friday 16th January 2026 15:26
            await setFixedClockTime(page, '2026-01-16T15:26:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            // Verify that on the page there is one active card per each active season of the user
            const cards = page.getByTestId('active-season-card');

            // We expect at least one card based on the test user data
            const count = await cards.count();
            expect(count).toBeGreaterThan(0);

            // Verify that each card on the header contains the league and season and team name and division
            for (let i = 0; i < count; i++) {
                const card = cards.nth(i);
                await expect(card.getByTestId('active-season-league')).toBeVisible();
                await expect(card.getByTestId('active-season-team')).toBeVisible();

                // Verify text content is not empty
                const leagueText = await card.getByTestId('active-season-league').textContent();
                const teamText = await card.getByTestId('active-season-team').textContent();
                expect(leagueText).toBeTruthy();
                expect(teamText).toBeTruthy();
            }
        });

        test('only one active season expanded at the time', async ({ page }) => {
            // Set fixed clock time to Friday 16th January 2026 15:26
            await setFixedClockTime(page, '2026-01-16T15:26:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            const cards = page.getByTestId('active-season-card');
            const count = await cards.count();

            // Ensure we have at least 3 cards for this test scenario as per instructions
            expect(count).toBeGreaterThanOrEqual(3);

            // Verify that all the 3 active season cards are collapsed
            for (let i = 0; i < count; i++) {
                await expect(cards.nth(i).getByTestId('active-season-details')).not.toBeVisible();
            }

            // Verify that after expanding the 1st season card, that is expanded, the other two are collapsed
            await cards.nth(0).getByTestId('active-season-header').click();
            await expect(cards.nth(0).getByTestId('active-season-details')).toBeVisible();
            await expect(cards.nth(1).getByTestId('active-season-details')).not.toBeVisible();
            await expect(cards.nth(2).getByTestId('active-season-details')).not.toBeVisible();

            // Verify that after expanding the 2nd season card, that is expanded, the other two are collapsed
            await cards.nth(1).getByTestId('active-season-header').click();
            await expect(cards.nth(1).getByTestId('active-season-details')).toBeVisible();
            await expect(cards.nth(0).getByTestId('active-season-details')).not.toBeVisible();
            await expect(cards.nth(2).getByTestId('active-season-details')).not.toBeVisible();

            // Verify that after expanding the 3nd season card, that is expanded, the other two are collapsed
            await cards.nth(2).getByTestId('active-season-header').click();
            await expect(cards.nth(2).getByTestId('active-season-details')).toBeVisible();
            await expect(cards.nth(0).getByTestId('active-season-details')).not.toBeVisible();
            await expect(cards.nth(1).getByTestId('active-season-details')).not.toBeVisible();
        });

        test('when there is only one Active Season Card, it is already opened', async ({ page }) => {
            // Set fixed clock time to Friday 16th January 2026 15:26
            await setFixedClockTime(page, '2026-01-16T15:26:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered2@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            const cards = page.getByTestId('active-season-card');
            const count = await cards.count();

            // Ensure we have exactly 1 card for this test scenario
            expect(count).toBe(1);

            // Verify that the only active season card is expanded
            await expect(cards.nth(0).getByTestId('active-season-details')).toBeVisible();
        });

        test('before the registrations_start_date the Active Season Card is not visualised', async ({ page }) => {
            // Set fixed clock time before FLICK registration start (2025-11-01)
            await setFixedClockTime(page, '2025-10-30T12:00:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            const cards = page.getByTestId('active-season-card');

            // We expect FLICK to be hidden, so only 2 cards (CLTTL and BCS) should be visible
            await expect(cards).toHaveCount(2);

            // Verify FLICK is not among the visible cards
            const count = await cards.count();
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                expect(leagueText).not.toContain('FLICK');
            }
        });

        test('after the ratings_end_date the Active Season Card is not visualised', async ({ page }) => {
            // Set fixed clock time after FLICK ratings end date (2026-02-01)
            await setFixedClockTime(page, '2026-02-01T12:00:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            const cards = page.getByTestId('active-season-card');

            // We expect FLICK to be hidden, so only 2 cards (CLTTL and BCS) should be visible
            await expect(cards).toHaveCount(2);

            // Verify FLICK is not among the visible cards
            const count = await cards.count();
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                expect(leagueText).not.toContain('FLICK');
            }
        });

        test('until 2h after the match start time, NEXT match header shows "Today\'s Match"', async ({ page }) => {
            // Morpeth 10 has a match on Friday 16th January 2026 at 18:45
            // Set clock to 20:46 (2h1min after the match start time)
            // Per the logic: Next fixture is where startDateTime >= (now - 2 hours)
            // At 20:46, now - 2h = 18:46, so 18:45 < 18:46, making it the previous match
            // Since the previous match is on the same day, it shows "Today's Match"
            await setFixedClockTime(page, '2026-01-16T20:45:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            // Find and expand the CLTTL 2025-2026 active season card
            const cards = page.getByTestId('active-season-card');
            const count = await cards.count();
            expect(count).toBeGreaterThan(0);

            // Find the CLTTL card by checking the league text
            let clttlCardIndex = -1;
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                if (leagueText && leagueText.includes('CLTTL') && leagueText.includes('2025-2026')) {
                    clttlCardIndex = i;
                    break;
                }
            }

            expect(clttlCardIndex).toBeGreaterThanOrEqual(0);

            // Expand the CLTTL card
            await cards.nth(clttlCardIndex).getByTestId('active-season-header').click();
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-details')).toBeVisible();

            // Wait for loading to complete (may take longer due to network requests)
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-loading')).not.toBeVisible({ timeout: 10000 });

            // Verify that the previous match header shows "Previous Match"
            const previousMatchHeader = cards.nth(clttlCardIndex).getByTestId('active-season-prev-match-header');
            await expect(previousMatchHeader).toContainText("Previous Match");

            // Verify that the next match header shows "Today's Match"
            const details = cards.nth(clttlCardIndex).getByTestId('active-season-next-match-header');
            await expect(details).toContainText("Today's Match");

            // Verify both Previous Match and Next Match sections are visible
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-prev-match')).toBeVisible();
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-next-match')).toBeVisible();

            // Verify the previous match (Today's Match) shows the correct date (Friday 16th Jan 18:45)
            const prevMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-prev-match').textContent();
            expect(prevMatchText).toContain('Fri 12th Dec 18:45');
            expect(prevMatchText).toContain('Vs Irving 4');

            // Verify the next match shows the upcoming fixture (Tuesday 20th Jan)
            const nextMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-next-match').textContent();
            expect(nextMatchText).toContain('Fri 16th Jan 18:45');
            expect(nextMatchText).toContain('Vs Fusion 5');
        });

        test('2h after the match start time, PREVIOUS match header shows "Today\'s Match"', async ({ page }) => {
            // Morpeth 10 has a match on Friday 16th January 2026 at 18:45
            // Set clock to 20:46 (2h1min after the match start time)
            // Per the logic: Next fixture is where startDateTime >= (now - 2 hours)
            // At 20:46, now - 2h = 18:46, so 18:45 < 18:46, making it the previous match
            // Since the previous match is on the same day, it shows "Today's Match"
            await setFixedClockTime(page, '2026-01-16T20:46:00Z');

            const user = new UserFlow(page);
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            await user.navigateToKudos();

            // Find and expand the CLTTL 2025-2026 active season card
            const cards = page.getByTestId('active-season-card');
            const count = await cards.count();
            expect(count).toBeGreaterThan(0);

            // Find the CLTTL card by checking the league text
            let clttlCardIndex = -1;
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                if (leagueText && leagueText.includes('CLTTL') && leagueText.includes('2025-2026')) {
                    clttlCardIndex = i;
                    break;
                }
            }

            expect(clttlCardIndex).toBeGreaterThanOrEqual(0);

            // Expand the CLTTL card
            await cards.nth(clttlCardIndex).getByTestId('active-season-header').click();
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-details')).toBeVisible();

            // Wait for loading to complete (may take longer due to network requests)
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-loading')).not.toBeVisible({ timeout: 10000 });

            // Verify that the previous match header shows "Today's Match"
            const previousMatchHeader = cards.nth(clttlCardIndex).getByTestId('active-season-prev-match-header');
            await expect(previousMatchHeader).toContainText("Today's Match");

            // Verify that the next match header shows "Next Match"
            const details = cards.nth(clttlCardIndex).getByTestId('active-season-next-match-header');
            await expect(details).toContainText("Next Match");

            // Verify both Previous Match and Next Match sections are visible
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-prev-match')).toBeVisible();
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-next-match')).toBeVisible();

            // Verify the previous match (Today's Match) shows the correct date (Friday 16th Jan 18:45)
            const prevMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-prev-match').textContent();
            expect(prevMatchText).toContain('Fri 16th Jan 18:45');
            expect(prevMatchText).toContain('Vs Fusion 5');

            // Verify the next match shows the upcoming fixture (Tuesday 20th Jan)
            const nextMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-next-match').textContent();
            expect(nextMatchText).toContain('Tue 20th Jan 18:45');
            expect(nextMatchText).toContain('Vs Walworth Tigers');
        });
    });
});
