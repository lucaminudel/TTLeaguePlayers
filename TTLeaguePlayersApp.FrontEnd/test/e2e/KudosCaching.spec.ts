import { test, expect, type Page } from '@playwright/test';
import { User } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

async function setFixedClockTime(page: Page, dateTime: string): Promise<void> {
    await page.addInitScript((time) => {
        window.__FIXED_CLOCK_TIME__ = time;
    }, dateTime);
    await page.evaluate((time) => {
        window.__FIXED_CLOCK_TIME__ = time;
    }, dateTime);
}

interface CognitoAttribute {
    Name: string;
    Value: string;
}

interface CognitoUserResponse {
    UserAttributes?: CognitoAttribute[];
}

interface ActiveSeasonEntry {
    latest_kudos: number[];
    [key: string]: unknown;
}

async function mockCognitoLatestKudos(page: Page) {
    await page.route('**/cognito-idp.*.amazonaws.com/', async (route) => {
        const request = route.request();
        const headers = request.headers();
        const xAmzTarget = headers['x-amz-target'] ?? '';
        if (request.method() === 'POST' && xAmzTarget.endsWith('.GetUser')) {
            try {
                const response = await route.fetch();
                const contentType = response.headers()['content-type'];
                if (!contentType || (!contentType.includes('application/x-amz-json') && !contentType.includes('application/json'))) {
                    await route.continue();
                    return;
                }
                const body = await response.json() as CognitoUserResponse;
                if (body.UserAttributes) {
                    const activeSeasonsAttr = body.UserAttributes.find((attr) =>
                        attr.Name === 'custom:active_seasons' || attr.Name === 'active_seasons'
                    );
                    if (activeSeasonsAttr?.Value) {
                        try {
                            const seasons = JSON.parse(activeSeasonsAttr.Value) as ActiveSeasonEntry[];
                            if (Array.isArray(seasons)) {
                                const modifiedSeasons = seasons.map((season) => ({
                                    ...season,
                                    latest_kudos: []
                                }));
                                activeSeasonsAttr.Value = JSON.stringify(modifiedSeasons);
                            }
                        } catch (e) {
                            console.log('Failed to parse or modify active_seasons in mock:', e);
                        }
                    }
                }
                await route.fulfill({ response, body: JSON.stringify(body) });
                return;
            } catch (err) {
                console.log('Error mocking Cognito response:', err);
                await route.continue();
            }
        }
        await route.continue();
    });
}

test.describe('Kudos Caching E2E', () => {
    test('Verify standings are cached and invalidated on award', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        test.setTimeout(90000);

        const user = new User(page);

        // 1. Mock Cognito to clear latest_kudos (enables the Rate button)
        await mockCognitoLatestKudos(page);

        // 2. Set fixed clock to make "Previous Match" predictable (Fusion 5 context)
        await setFixedClockTime(page, '2026-01-18T12:00:00Z');

        // 3. Login
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        // 4. Navigate to Kudos Standings
        const kudosStandingsPage = await user.navigateToKudosStandings();

        // Handle season selection if it appears
        await kudosStandingsPage.selectActiveSeason('CLTTL', '2025-2026', 'Morpeth 10');

        // 5. Wait for data to load BEFORE checking localStorage
        await expect(page.locator('text=Loading...')).not.toBeVisible();
        await expect(page.getByTestId('my-kudos-items').or(page.getByText('No kudos awarded yet.'))).toBeVisible();

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
