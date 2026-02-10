import { test, expect, type Page } from '@playwright/test';
import { User } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

async function setFixedClockTime(page: Page, dateTime: string): Promise<void> {
    // 1. For future "hard" navigations or reloads
    await page.addInitScript((time) => {
        window.__FIXED_CLOCK_TIME__ = time;
    }, dateTime);

    // 2. For the current page context (if already loaded)
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
                // Fetch original response
                const response = await route.fetch();
                // Check if response is JSON
                const contentType = response.headers()['content-type'];
                if (!contentType || (!contentType.includes('application/x-amz-json') && !contentType.includes('application/json'))) {
                    await route.continue();
                    return;
                }

                const body = await response.json() as CognitoUserResponse;

                // Modify active_seasons attribute
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
                                    latest_kudos: [] // Clear latest_kudos to prevent test failure on re-runs
                                }));
                                activeSeasonsAttr.Value = JSON.stringify(modifiedSeasons);
                            }
                        } catch (e) {
                            console.log('Failed to parse or modify active_seasons in mock:', e);
                        }
                    }
                }

                await route.fulfill({
                    response,
                    body: JSON.stringify(body)
                });
                return;

            } catch (err) {
                console.log('Error mocking Cognito response:', err);
                await route.continue();
            }
        }

        await route.continue();
    });
}

test.describe('Award Kudos and Kudos Standings', () => {

    test('Kudos Standings show all the kudos awarded by you', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // Mock Cognito to always return empty latest_kudos
        await mockCognitoLatestKudos(page);

        const user = new User(page);

        // Login
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        // 1. Rate Match 1: 18th Jan 2026 - Fusion 5 - Positive
        await setFixedClockTime(page, '2026-01-18T12:00:00Z');
        //await page.goto('about:blank');
        const kudosPage = await user.navigateToKudos();

        // Open Active Season CLTTL 2020-2026 Division 4 Morpeth 10
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // Rate Previous Match against "Fusion 5"
        await kudosPage.ratePositiveKudosFromOpenCard('Fusion 5');

        // 2. Rate Match 2: 21st Jan 2026 - Walworth Tigers - Neutral
        await setFixedClockTime(page, '2026-01-21T12:00:00Z');
        //await page.goto('about:blank');
        await user.navigateToKudos();

        // Open Active Season CLTTL 2020-2026 Division 4 Morpeth 10
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // Rate "Previous Match" against "Walworth Tigers"
        await kudosPage.RateNeutralKudosFromOpenCard('Walworth Tigers');


        // 3. Rate Match 3: 7th Feb 2026 - Fusion 6 Jr - Negative
        await setFixedClockTime(page, '2026-02-07T12:00:00Z');
        //await page.goto('about:blank');
        await user.navigateToKudos();

        // Open Active Season CLTTL 2020-2026 Division 4 Morpeth 10
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // Rate "Previous Match" against "Fusion 6 Jr"
        await kudosPage.RateNegativeKudosFromOpenCard('Fusion 6 Jr');

        // Check "Awarded" tab is active. 
        // Assuming tab buttons have some state class or we verify content.
        // The previous implementation used border-b-2 border-blue-500 for active tab.
        await expect(page.getByRole('button', { name: 'Awarded' })).toHaveClass(/border-blue-500/);

        // Check list items
        // We expect the list to appear
        // Items: Fusion 6 Jr (Negative), Walworth Tigers (Neutral), Fusion 5 (Positive)
        // They should be ordered by date probably? The API returns a list, usually recent first or implicit DB order.
        // The Requirement says "show all the kudos awarded". 
        // Let's verify presence and correct mapping.

        const listItems = page.getByTestId('kudos-item'); // Based on KudosStanding.tsx component
        await expect(listItems).toHaveCount(3);

        // Verify content. We can match text inside each card.
        // Note: The order depends on the API. 
        // If API returns implicitly ordered by insertion or date? 
        // Let's assume generic contain for now or checks specific text combinations.

        // Checking one by one if they exist in the list implies we know the order.
        // Let's check that we can find each expected card.

        await expect(listItems.filter({ hasText: 'Fusion 6 Jr' }).filter({ hasText: 'Negative' })).toBeVisible();
        await expect(listItems.filter({ hasText: 'Walworth Tigers' }).filter({ hasText: 'Neutral' })).toBeVisible();
        await expect(listItems.filter({ hasText: 'Fusion 5' }).filter({ hasText: 'Positive' })).toBeVisible();

    });

});
