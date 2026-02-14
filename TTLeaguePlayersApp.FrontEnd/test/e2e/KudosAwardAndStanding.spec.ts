import { test, expect, type Page } from '@playwright/test';
import { User } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';


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

test.describe.configure({ mode: 'serial' });

interface KudosIdentifier {
    league: string;
    season: string;
    division: string;
    receiving_team: string;
    home_team: string;
    away_team: string;
    giver_person_sub: string;
}

test.describe('Kudos Standings', () => {
    const createdKudos: { body: KudosIdentifier; auth: string; url: string }[] = [];

    test.beforeEach(({ page }) => {
        page.on('request', (request) => {
            if (request.url().includes('/kudos') && request.method() === 'POST') {
                const body = request.postDataJSON() as KudosIdentifier | null;
                const auth = request.headers().authorization as string | undefined;
                if (body !== null && auth !== undefined) {
                    createdKudos.push({
                        body: {
                            league: body.league,
                            season: body.season,
                            division: body.division,
                            receiving_team: body.receiving_team,
                            home_team: body.home_team,
                            away_team: body.away_team,
                            giver_person_sub: body.giver_person_sub
                        },
                        auth,
                        url: request.url()
                    });
                }
            }
        });
    });

    test.afterAll(async ({ request }) => {
        if (createdKudos.length === 0) return;

        console.log(`\n🧹 [Cleanup] Starting deletion of ${String(createdKudos.length)} created Kudos...`);
        let successCount = 0;
        let failCount = 0;

        // Clean up created kudos in reverse order
        for (const item of [...createdKudos].reverse()) {
            let attempts = 0;
            const maxAttempts = 3;
            let deleted = false;

            while (attempts < maxAttempts && !deleted) {
                attempts++;
                try {
                    const response = await request.delete(item.url, {
                        data: item.body,
                        headers: {
                            'Authorization': item.auth
                        }
                    });

                    if (response.ok()) {
                        deleted = true;
                        successCount++;
                    } else {
                        const status = response.status();
                        const text = await response.text();
                        throw new Error(`Status ${String(status)}: ${text}`);
                    }
                } catch (error) {
                    if (attempts < maxAttempts) {
                        const delay = attempts * 1000;
                        console.warn(`⚠️ [Cleanup] Attempt ${String(attempts)} failed for Kudos to ${item.body.receiving_team}. Retrying in ${String(delay)}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error(`❌ [Cleanup] Failed to delete Kudos to ${item.body.receiving_team} after ${String(maxAttempts)} attempts:`, error instanceof Error ? error.message : error);
                        failCount++;
                    }
                }
            }
        }

        if (failCount > 0) {
            console.error(`\n⚠️ [Cleanup] Finished with ${String(failCount)} failures and ${String(successCount)} successes. Please check the datastore for stale items.`);
        } else {
            console.log(`\n✅ [Cleanup] Successfully deleted all ${String(successCount)} created Kudos.`);
        }
    });


    test('Step 1: Award kudos & show all the kudos Awarded by you', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // Long running test due to multiple interactions and waits
        // Whole test timeout extended from the 30.0000 ms default to 60.000 ms
        test.setTimeout(60000);

        // Mock Cognito to always return empty latest_kudos
        await mockCognitoLatestKudos(page);

        const user = new User(page);

        // Login
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        // 1. Rate Match 1: 18th Jan 2026 - Fusion 5 - Positive
        await user.setFixedClockTime('2026-01-18T12:00:00Z');
        const kudosPage = await user.navigateToKudos();

        // Open Active Season CLTTL 2020-2026 Division 4 Morpeth 10
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // Rate Previous Match against "Fusion 5"
        await kudosPage.ratePositiveKudosFromOpenCard('Fusion 5');

        // 2. Rate Match 2: 21st Jan 2026 - Walworth Tigers - Neutral
        await user.setFixedClockTime('2026-01-21T12:00:00Z');
        await user.navigateToKudos();

        // Open Active Season CLTTL 2020-2026 Division 4 Morpeth 10
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // Rate "Previous Match" against "Walworth Tigers"
        await kudosPage.RateNeutralKudosFromOpenCard('Walworth Tigers');


        // 3. Rate Match 3: 7th Feb 2026 - Fusion 6 Jr - Negative
        await user.setFixedClockTime('2026-02-07T12:00:00Z');
        await user.navigateToKudos();

        // Open Active Season CLTTL 2020-2026 Division 4 Morpeth 10
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Morpeth 10');

        // Rate "Previous Match" against "Fusion 6 Jr"
        const kudosStandingsPage = await kudosPage.RateNegativeKudosFromOpenCard('Fusion 6 Jr');


        // Check list items
        // We expect the list to appear
        // Items: Fusion 6 Jr (Negative), Walworth Tigers (Neutral), Fusion 5 (Positive)
        // They should be ordered by date 

        expect(await kudosStandingsPage.myKudosItemsCount()).toBe(3);

        // Verify content. We can match text inside each card.
        // Note: The order depends on the API. 
        // If API returns implicitly ordered by insertion or date? 
        // Let's assume generic contain for now or checks specific text combinations.

        // Checking one by one if they exist in the list implies we know the order.
        // Let's check that we can find each expected card.
        await kudosStandingsPage.myKudosItemsContains(1, 'Fusion 6 Jr', 'Negative');
        await kudosStandingsPage.myKudosItemsContains(2, 'Walworth Tigers', 'Neutral');
        await kudosStandingsPage.myKudosItemsContains(3, 'Fusion 5', 'Positive');
    });

    test('Step 2: Kudos awarded to your team & show your Team\'s kudos', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // Long running test due to multiple interactions and waits
        // Whole test timeout extended from the 30.0000 ms default to 60.000 ms
        test.setTimeout(60000);

        // Mock Cognito to always return empty latest_kudos
        await mockCognitoLatestKudos(page);

        const user = new User(page);

        // === User 1: Walworth Tigers gives kudos to Morpeth 10 ===
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_wt@user.test', 'aA1!56789012');

        // Set current date time: 21st January 2026
        await user.setFixedClockTime('2026-01-21T12:00:00Z');

        // Navigate to Kudos
        const kudosPageWT = await user.navigateToKudos();

        // Active Season CLTTL 2025-2026 Division 4 Walworth Tigers
        await kudosPageWT.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Walworth Tigers');

        // Rate the match with Morpeth 10, and give a Positive Kudos
        await kudosPageWT.ratePositiveKudosFromOpenCard('Morpeth 10');

        // Logout
        await user.menu.open();
        await user.menu.logout();

        // === User 2: Fusion 5 gives kudos to Morpeth 10 ===
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_f5@user.test', 'aA1!56789012');

        // Set current date time: 18th January 2026
        await user.setFixedClockTime('2026-01-18T12:00:00Z');

        // Navigate to Kudos
        const kudosPageF5 = await user.navigateToKudos();

        // Open Active Season CLTTL 2025-2026 Division 4 Fusion 5
        await kudosPageF5.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Fusion 5');

        // Rate the match with Morpeth 10, and give a Positive Kudos
        await kudosPageF5.ratePositiveKudosFromOpenCard('Morpeth 10');

        // Logout
        await user.menu.open();
        await user.menu.logout();

        // === User 3: Morpeth 10 user checks Team's kudos ===
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        // Navigate to Kudos Standings
        const kudosStandingsPage = await user.navigateToKudosStandings();

        // Select CLTTL 2025-2026 Division 4 Morpeth 10
        await kudosStandingsPage.selectActiveSeason('CLTTL', '2025-2026', 'Morpeth 10');

        // Open the Team's tab
        await kudosStandingsPage.openTeamTab();

        // Check that there are 2 awarded kudos listed
        expect(await kudosStandingsPage.teamKudosItemsCount()).toBe(2);

        // Verify the kudos are from Walworth Tigers and Fusion 5, both Positive
        // Each item should show the team name and have a "Positive" badge
        await kudosStandingsPage.teamKudosItemsContains(1, 'Walworth ', 'Positive');
        await kudosStandingsPage.teamKudosItemsContains(2, 'Fusion 5', 'Positive');
    });

    test('Step 3: Kudos awarded to other teams & show Team\'s standings', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // Long running test due to multiple interactions and waits
        // Whole test timeout extended from the 30.0000 ms default to 60.000 ms
        test.setTimeout(60000);

        // Mock Cognito to always return empty latest_kudos
        await mockCognitoLatestKudos(page);

        const user = new User(page);

        // === User 1: Walworth Tigers gives negative kudos to Fusion 5 and Fusion 6 Jr ===
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_wt@user.test', 'aA1!56789012');

        // Set current date time: 10th February 2026
        await user.setFixedClockTime('2026-02-10T12:00:00Z');

        // Navigate to Kudos
        let kudosPageWT = await user.navigateToKudos();

        // Open Active Season CLTTL 2025-2026 Division 4 Walworth Tigers
        await kudosPageWT.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Walworth Tigers');

        // Rate the match with Fusion 5, and give a Negative Kudos
        await kudosPageWT.RateNegativeKudosFromOpenCard('Fusion 5');

        // Set current date time: 7th March 2026
        await user.setFixedClockTime('2026-03-07T12:00:00Z');

        // Navigate to Kudos
        kudosPageWT = await user.navigateToKudos();

        // Open Active Season CLTTL 2025-2026 Division 4 Walworth Tigers
        await kudosPageWT.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Walworth Tigers');

        // Rate the match with Fusion 6 Jr, and give a Negative Kudos
        await kudosPageWT.RateNegativeKudosFromOpenCard('Fusion 6 Jr');

        // Logout
        await user.menu.open();
        await user.menu.logout();

        // === User 2: Fusion 5 gives positive and negative kudos ===
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_f5@user.test', 'aA1!56789012');

        // Set current date time: 10th February 2026
        await user.setFixedClockTime('2026-02-10T12:00:00Z');

        // Navigate to Kudos
        let kudosPageF5 = await user.navigateToKudos();

        // Open Active Season CLTTL 2025-2026 Division 4 Fusion 5
        await kudosPageF5.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Fusion 5');

        // Rate the match with Walworth Tigers, and give a Positive Kudos
        await kudosPageF5.ratePositiveKudosFromOpenCard('Walworth Tigers');

        // Set current date time: 15th November 2025
        await user.setFixedClockTime('2025-11-15T12:00:00Z');

        // Navigate to Kudos
        kudosPageF5 = await user.navigateToKudos();

        // Open Active Season CLTTL 2025-2026 Division 4 Fusion 5
        await kudosPageF5.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Fusion 5');

        // Rate the match with Fusion 6 Jr, and give a Negative Kudos
        await kudosPageF5.RateNegativeKudosFromOpenCard('Fusion 6 Jr');

        // Navigate to Kudos Standings
        const kudosStandingsPage = await user.navigateToKudosStandings();

        // Open the Table tab
        await kudosStandingsPage.openTableTab();

        // Check that the Table Tab is visible (headers of the two tables)
        await expect(page.getByTestId('kudos-standings-tables')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('positive-kudos-standings')).toBeVisible();
        await expect(page.getByTestId('negative-kudos-standings')).toBeVisible();

        // Check the Positive Kudos table contains 3 entries + 1 as db prev state
        expect(await kudosStandingsPage.positiveKudosTableCount()).toBe(3);

        // Verify the entries in positive kudos table
        // 1 - Morpeth 10, 3 matches with positive kudos
        await kudosStandingsPage.positiveKudosTableContains('Morpeth 10', '2');

        // 2 or 3 - Walworth Tigers, 1 match with positive kudos
        await kudosStandingsPage.positiveKudosTableContains('Walworth Tigers', '1');

        // 2 or 3 - Fusion 5, 1 match with positive kudos
        await kudosStandingsPage.positiveKudosTableContains('Fusion 5', '1');

        // Check the Negative Kudos table contains 2 entries + 2 as db prev state
        expect(await kudosStandingsPage.negativeKudosTableCount()).toBe(2);

        // Verify the entries in negative kudos table
        // 1 - Fusion 6 Jr, 3 matches with negative kudos
        await kudosStandingsPage.negativeKudosTableContains('Fusion 6 Jr', '3');

        // 2 - Fusion 5, 1 match with negative kudos
        await kudosStandingsPage.negativeKudosTableContains('Fusion 5', '1');

        // Check the Neutral Kudos table contains 1 entry
        expect(await kudosStandingsPage.neutralKudosTableCount()).toBe(1);

        // Verify the entries in neutral kudos table
        // 1 - Walworth Tigers, 1 match with neutral kudos
        await kudosStandingsPage.neutralKudosTableContains('Walworth Tigers', '1');
    });

});
