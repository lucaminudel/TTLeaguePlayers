import { test, expect } from '@playwright/test';
import { User } from './page-objects/User';
import { mockCognitoLatestKudos } from './helpers/cognito-latest_kudos-mock';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

test.describe('Kudos Caching E2E', () => {
    test('Verify standings are cached and invalidated on award', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        test.setTimeout(90000);

        const user = new User(page);

        // 1. Mock Cognito to clear latest_kudos (enables the Rate button)
        await mockCognitoLatestKudos(page);

        // 2. Set fixed clock to make "Previous Match" predictable (Fusion 5 context)
        await user.setFixedClockTime('2026-01-18T12:00:00Z');

        // 3. Login
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        // 4. Navigate to Kudos Standings
        const kudosStandingsPage = await user.navigateToKudosStandings();

        // Handle season selection if it appears
        await kudosStandingsPage.selectActiveSeason('CLTTL', '2025-2026', 'Morpeth 10');

        // 5. Wait for data to load BEFORE checking localStorage
        await expect(page.locator('text=Loading...')).not.toBeVisible();
        await expect(page.getByTestId('my-kudos-items').or(page.getByText('No kudos awarded yet.'))).toBeVisible();

        // Check for error first to fail fast with a better message
        const errorLocator = page.getByTestId('error-message');
        if (await errorLocator.isVisible()) {
            const errorText = await errorLocator.textContent();
            throw new Error(`Kudos Standings failed to load: ${errorText ?? 'Unknown error'}`);
        }

        try {
            await expect(page.getByTestId('my-kudos-items').or(page.getByText('No kudos awarded yet.'))).toBeVisible({ timeout: 15000 });
        } catch (e) {
            console.log('--- PAGE BODY CONTENT ON FAILURE ---');
            console.log(await page.content());
            throw e;
        }

        // 6. Verify localStorage has cache entries
        const cacheKeysBefore = await page.evaluate(() => {
            return Object.keys(localStorage).filter(key => key.startsWith('kudos_cache_'));
        });
        expect(cacheKeysBefore.length).toBeGreaterThan(0);

        // 7. Intercept and BLOCK GET requests to avoid premature re-population after award
        // We use a broader pattern to catch /kudos and /kudos/standings
        await page.route('**/kudos**', async (route) => {
            if (route.request().method() === 'GET') {
                // Return a delay instead of abort to avoid UI error states
                await new Promise(resolve => setTimeout(resolve, 5000));
                await route.continue();
            } else {
                await route.continue();
            }
        });

        // 8. Navigate to Award Kudos -> Award it
        const kudosPage = await user.navigateToKudos();
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // This method clicks "Rate", "Confirm", and waits for redirect
        await kudosPage.ratePositiveKudosFromOpenCard('Fusion 5');

        // 9. Verify localStorage is cleared (the 5s delay on GET ensures it stays empty for this check)
        const cacheKeysAfter = await page.evaluate(() => {
            return Object.keys(localStorage).filter(key => key.startsWith('kudos_cache_'));
        });
        expect(cacheKeysAfter.length).toBe(0);
    });
});
