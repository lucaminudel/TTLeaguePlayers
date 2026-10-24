import { test, stubbedTest, expect } from './helpers/tabletennis365-test-setup';
import { User as UserFlow, LoginPage, RegisterPage } from './page-objects/User';
import { mockCognitoLatestKudos } from './helpers/cognito-latest_kudos-mock';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';


test.describe('Kudos', () => {
    test.describe('authenticated users only page, login - logout flows', () => {
        test('when a non logged-in user tries to navigate to kudos, it redirects to login and after successful login it redirects back to kudos', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

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
            await expect(page.locator('h2')).toHaveText('Matches & Kudos');
        });

        test('when a non logged-in user tries to navigate to kudos and login+verifyemail, is redirected through verification with returnUrl preserved', async ({ page }) => {
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
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

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

        stubbedTest('the Rate info modal, once dismissed with "don\'t show again", stays hidden for that user but not for another one on the same browser', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            // These users carry kudos from earlier runs, which would hide the Rate button.
            await mockCognitoLatestKudos(page);

            const user = new UserFlow(page);

            // User A: dismiss the info modal ticking "Don't show this message again".
            // Highbury 3 play Morpeth 10 on 16 October 2026.
            await user.setFixedClockTime('2026-10-16T20:46:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_kudos_highbury3@user.test', 'aA1!56789012');

            const kudosPageA = await user.navigateToKudos();
            await kudosPageA.findAndOpenActiveSeasonCard('CLTTL', '2026-2027', 'Highbury 3');
            await kudosPageA.clickRateFromOpenCard('Morpeth 10');

            await expect(kudosPageA.rateInfoModal()).toBeVisible();
            await kudosPageA.dismissRateInfoModal(true);

            // The OK click lands on the award-kudos page, which renders inside the MobileLayout,
            // so the menu is available to log out from there. No kudos is awarded.
            await user.menu.open();
            await user.menu.logout();

            // User B, same browser and so the same local storage: the preference is scoped to
            // user A's Cognito sub, so the modal must still appear.
            // Morpeth 11 Jr play Morpeth 10 on 9 October 2026, a different date.
            await user.setFixedClockTime('2026-10-09T20:46:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_kudos_morpeth11jr@user.test', 'aA1!56789012');

            const kudosPageB = await user.navigateToKudos();
            await kudosPageB.findAndOpenActiveSeasonCard('CLTTL', '2026-2027', 'Morpeth 11 Jr');
            await kudosPageB.clickRateFromOpenCard('Morpeth 10');

            await expect(kudosPageB.rateInfoModal()).toBeVisible();
        });

        test('shows previous and current match for all active seasons', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // CLTTL, BCS and FLICK are all active at this time.
            await user.setFixedClockTime('2027-01-16T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            // Verify that on the page there is one active card per each active season of the user
            const cards = kudosPage.activeSeasonCards();

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


        stubbedTest('after the last match, next match shows NONE', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // After the 2026-2027 ratings window, every fixture is previous.
            await user.setFixedClockTime('2027-06-30T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();
            const cards = kudosPage.activeSeasonCards();
            const count = await cards.count();
            expect(count).toBeGreaterThan(0);

            // Find the CLTTL card by checking the league text
            let clttlCardIndex = -1;
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                if (leagueText && leagueText.includes('CLTTL') && leagueText.includes('2026-2027')) {
                    clttlCardIndex = i;
                    break;
                }
            }

            expect(clttlCardIndex).toBeGreaterThanOrEqual(0);

            // Expand the CLTTL card
            await kudosPage.openActiveSeasonCard(clttlCardIndex);
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-details')).toBeVisible();

            // Wait for loading to complete (may take longer due to network requests)
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-loading')).not.toBeVisible({ timeout: 10000 });

            // Verify that the previous match header shows "Previous Match"
            const previousMatchHeader = cards.nth(clttlCardIndex).getByTestId('active-season-prev-match-header');
            await expect(previousMatchHeader).toContainText("Previous Match");

            // Verify that the next match header shows "Next Match"
            const details = cards.nth(clttlCardIndex).getByTestId('active-season-next-match-header');
            await expect(details).toContainText("Next Match");

            // Verify both Previous Match and Next Match sections are visible
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-prev-match')).toBeVisible();
            await expect(cards.nth(clttlCardIndex).getByTestId('active-season-next-match')).toBeVisible();

            // A completed fixture remains displayed when there is no next fixture. Do not let a
            // fixture-retrieval failure satisfy this assertion with its fallback message.
            const previousMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-prev-match').textContent();
            expect(previousMatchText).toContain('Vs ');
            expect(previousMatchText).not.toContain('No fixture found');

            // Verify the next match shows the upcoming fixture (Tuesday 20th Jan)
            const nextMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-next-match').textContent();
            expect(nextMatchText).toContain('None');
        });

        stubbedTest('only one active season expanded at the time', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // CLTTL, BCS and FLICK are all active at this time.
            await user.setFixedClockTime('2027-01-16T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            const cards = kudosPage.activeSeasonCards();
            const count = await cards.count();

            // The migrated user has three concurrent seasons at this date.
            expect(count).toBe(3);

            // Verify that both active season cards are collapsed.
            for (let i = 0; i < count; i++) {
                await expect(cards.nth(i).getByTestId('active-season-details')).not.toBeVisible();
            }

            // Verify that after expanding the first season card, the other cards are collapsed.
            await kudosPage.openActiveSeasonCard(0);
            await expect(cards.nth(0).getByTestId('active-season-details')).toBeVisible();
            await expect(cards.nth(1).getByTestId('active-season-details')).not.toBeVisible();
            await expect(cards.nth(2).getByTestId('active-season-details')).not.toBeVisible();

            await expect(cards.nth(0).getByTestId('active-season-prev-match')).toContainText('Vs ');

            // Verify that after expanding the second season card, the other cards are collapsed.
            await kudosPage.openActiveSeasonCard(1);
            await expect(cards.nth(1).getByTestId('active-season-details')).toBeVisible();
            await expect(cards.nth(0).getByTestId('active-season-details')).not.toBeVisible();
            await expect(cards.nth(2).getByTestId('active-season-details')).not.toBeVisible();
        });

        test('when there is only one Active Season Card, it is already opened', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // This BCS-only account has one active season at this date.
            await user.setFixedClockTime('2027-01-16T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered2@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            const cards = kudosPage.activeSeasonCards();
            const count = await cards.count();

            // Ensure we have exactly 1 card for this test scenario
            expect(count).toBe(1);

            // Verify that the only active season card is expanded
            await expect(cards.nth(0).getByTestId('active-season-details')).toBeVisible();
        });

        test('before the registrations_start_date the Active Season Card is not visualised', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // Set fixed clock time before FLICK registration start (2026-11-01).
            await user.setFixedClockTime('2026-10-30T12:00:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            const cards = kudosPage.activeSeasonCards();

            // CLTTL and BCS are active, while FLICK has not started.
            await expect(cards).toHaveCount(2);

            // Verify FLICK is not among the visible cards
            const count = await cards.count();
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                expect(leagueText).not.toContain('FLICK');
            }
        });

        test('after the ratings_end_date the Active Season Card is not visualised', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // Set fixed clock time after FLICK ratings end date (2027-02-01).
            await user.setFixedClockTime('2027-02-01T12:00:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            const cards = kudosPage.activeSeasonCards();

            // CLTTL and BCS remain active after FLICK has ended.
            await expect(cards).toHaveCount(2);

            // Verify FLICK is not among the visible cards
            const count = await cards.count();
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                expect(leagueText).not.toContain('FLICK');
            }
        });

        stubbedTest('until 2h after the match start time, NEXT match header shows "Today\'s Match"', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // Morpeth 10 has a match on Friday 16th October 2026 at 18:45.
            // Per the logic: Next fixture is where startDateTime >= (now - 2 hours)
            // At 20:45, now - 2h = 18:45, so the fixture is still next because the comparison is inclusive.
            // Since the next match is on the same day, it shows "Today's Match".
            await user.setFixedClockTime('2026-10-16T20:45:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            // Find and expand the CLTTL 2026-2027 active season card
            const cards = kudosPage.activeSeasonCards();
            const count = await cards.count();
            expect(count).toBeGreaterThan(0);

            // Find the CLTTL card by checking the league text
            let clttlCardIndex = -1;
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                if (leagueText && leagueText.includes('CLTTL') && leagueText.includes('2026-2027')) {
                    clttlCardIndex = i;
                    break;
                }
            }

            expect(clttlCardIndex).toBeGreaterThanOrEqual(0);

            // Expand the CLTTL card
            await kudosPage.openActiveSeasonCard(clttlCardIndex);
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

            // The earlier completed fixture remains previous.
            const prevMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-prev-match').textContent();
            expect(prevMatchText).toContain('Fri 9th Oct 18:45');
            expect(prevMatchText).toContain('Vs Morpeth 11 Jr');

            // At the exact two-hour boundary, the 16 October match remains next.
            const nextMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-next-match').textContent();
            expect(nextMatchText).toContain('Fri 16th Oct 18:45');
            expect(nextMatchText).toContain('Vs Highbury 3');
        });

        stubbedTest('2h after the match start time, PREVIOUS match header shows "Today\'s Match"', async ({ page }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

            const user = new UserFlow(page);
            // Morpeth 10 has a match on Friday 16th October 2026 at 18:45.
            // Set clock to 20:46 (2h1min after the match start time)
            // Per the logic: Next fixture is where startDateTime >= (now - 2 hours)
            // At 20:46, now - 2h = 18:46, so 18:45 < 18:46, making it the previous match
            // Since the previous match is on the same day, it shows "Today's Match"
            await user.setFixedClockTime('2026-10-16T20:46:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

            const kudosPage = await user.navigateToKudos();

            // Find and expand the CLTTL 2026-2027 active season card
            const cards = kudosPage.activeSeasonCards();
            const count = await cards.count();
            expect(count).toBeGreaterThan(0);

            // Find the CLTTL card by checking the league text
            let clttlCardIndex = -1;
            for (let i = 0; i < count; i++) {
                const leagueText = await cards.nth(i).getByTestId('active-season-league').textContent();
                if (leagueText && leagueText.includes('CLTTL') && leagueText.includes('2026-2027')) {
                    clttlCardIndex = i;
                    break;
                }
            }

            expect(clttlCardIndex).toBeGreaterThanOrEqual(0);

            // Expand the CLTTL card
            await kudosPage.openActiveSeasonCard(clttlCardIndex);
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

            // After two hours, the 16 October match is previous.
            const prevMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-prev-match').textContent();
            expect(prevMatchText).toContain('Fri 16th Oct 18:45');
            expect(prevMatchText).toContain('Vs Highbury 3');

            // The next fixture is Morpeth 9 v Morpeth 10 on 22 October.
            const nextMatchText = await cards.nth(clttlCardIndex).getByTestId('active-season-next-match').textContent();
            expect(nextMatchText).toContain('Thu 22nd Oct 18:45');
            expect(nextMatchText).toContain('Vs Morpeth 9');
        });
    });

    test.describe('error handling scenarios', () => {
        stubbedTest('shows "No fixture found" when network request fails', async ({ page, tableTennis365Stub }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');


            // Clear all storage before test
            await page.addInitScript(() => {
                localStorage.clear();
                sessionStorage.clear();
            });

            tableTennis365Stub.fixtures.failWithNetworkError();

            const user = new UserFlow(page);
            // Set fixed clock time
            await user.setFixedClockTime('2026-10-16T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');
            const kudosPage = await user.navigateToKudos();

            // Find and expand the first active season card
            const cards = kudosPage.activeSeasonCards();
            await expect(cards.first()).toBeVisible();
            await kudosPage.openActiveSeasonCard(0);

            // Wait for loading to complete
            await expect(cards.first().getByTestId('active-season-loading')).not.toBeVisible({ timeout: 15000 });

            // Verify "No fixture found" message is displayed
            await expect(cards.first().getByTestId('active-season-prev-match')).toHaveText('No fixture found, retry later or tomorrow');
            await expect(cards.first().getByTestId('active-season-next-match')).toHaveText('No fixture found, retry later or tomorrow');
        });

        stubbedTest('shows "No fixture found" when server returns HTTP error', async ({ page, tableTennis365Stub }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');



            // Clear all storage before test
            await page.addInitScript(() => {
                localStorage.clear();
                sessionStorage.clear();
            });

            tableTennis365Stub.fixtures.failWithHttpStatus(500);

            const user = new UserFlow(page);
            // Set fixed clock time
            await user.setFixedClockTime('2026-10-16T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');
            const kudosPage = await user.navigateToKudos();

            // Find and expand the first active season card
            const cards = kudosPage.activeSeasonCards();
            await expect(cards.first()).toBeVisible();
            await kudosPage.openActiveSeasonCard(0);

            // Wait for loading to complete
            await expect(cards.first().getByTestId('active-season-loading')).not.toBeVisible({ timeout: 15000 });

            // Verify "No fixture found" message is displayed
            await expect(cards.first().getByTestId('active-season-prev-match')).toHaveText('No fixture found, retry later or tomorrow');
            await expect(cards.first().getByTestId('active-season-next-match')).toHaveText('No fixture found, retry later or tomorrow');
        });

        stubbedTest('shows "No fixture found" when server returns "service unavailable"', async ({ page, tableTennis365Stub }) => {
            test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');


            // Clear all storage before test
            await page.addInitScript(() => {
                localStorage.clear();
                sessionStorage.clear();
            });

            tableTennis365Stub.fixtures.returnServiceUnavailable();

            const user = new UserFlow(page);
            // Set fixed clock time
            await user.setFixedClockTime('2026-10-16T15:26:00Z');
            await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');
            const kudosPage = await user.navigateToKudos();

            // Find and expand the first active season card
            const cards = kudosPage.activeSeasonCards();
            await expect(cards.first()).toBeVisible();
            await kudosPage.openActiveSeasonCard(0);

            // Wait for loading to complete
            await expect(cards.first().getByTestId('active-season-loading')).not.toBeVisible({ timeout: 15000 });

            // Verify "No fixture found" message is displayed
            await expect(cards.first().getByTestId('active-season-prev-match')).toHaveText('No fixture found, retry later or tomorrow');
            await expect(cards.first().getByTestId('active-season-next-match')).toHaveText('No fixture found, retry later or tomorrow');
        });
    });
});
