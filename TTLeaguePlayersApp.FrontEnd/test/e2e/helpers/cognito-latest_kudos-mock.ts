import type { Page } from '@playwright/test';

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

export async function mockCognitoLatestKudos(page: Page) {
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
