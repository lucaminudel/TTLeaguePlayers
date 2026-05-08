import { test, expect, type Page } from '@playwright/test';
import { User } from './page-objects/User';
import { TestInviteBuilder } from './builders/TestInviteBuilder';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

test.describe('Join Page', () => {
    const testInviteId = '6ipEOiGEL6';

    test('should show loading state', async ({ page }) => {
        const user = new User(page);
        await user.navigateToJoin(testInviteId);
    });

    test('should display invite details when successful (mocked)', async ({ page }) => {
        const user = new User(page);
        const inviteData = new TestInviteBuilder(testInviteId).withRole('CAPTAIN').build();

        await page.route('**/invites/*', async (route) => {
            await route.fulfill({ json: inviteData });
        });

        await user.navigateToJoin(testInviteId);
        await expect(page.locator('h2')).toHaveText('Join - Personal Invite');

        const inviteDetails = page.getByTestId('join-invite-details');
        await expect(inviteDetails.getByTestId('join-invite-from')).toContainText('Luca');
        await expect(inviteDetails.getByTestId('join-invite-to')).toContainText('Team Captain');
        await expect(inviteDetails.getByTestId('join-invite-to')).toContainText('John Doe');
        await expect(inviteDetails.getByTestId('join-invite-email')).toContainText('john@example.com');
        await expect(inviteDetails.getByTestId('join-invite-team')).toContainText('The Smashers');
        await expect(inviteDetails.getByTestId('join-invite-team')).toContainText('Premier');
        await expect(inviteDetails.getByTestId('join-invite-league-season')).toContainText('Local League');
        await expect(inviteDetails.getByTestId('join-invite-league-season')).toContainText('Winter 2024');

        const registerButton = page.getByTestId('join-register-button');
        await expect(registerButton).toBeVisible();
    });

    test('should display club manager invite details when successful (mocked)', async ({ page }) => {
        const user = new User(page);
        const inviteData = new TestInviteBuilder(testInviteId)
            .asClubManager('Morpeth TTC', 'London')
            .withName('Jane Smith')
            .withEmail('jane@example.com')
            .build();

        await page.route('**/invites/*', async (route) => {
            await route.fulfill({ json: inviteData });
        });

        await user.navigateToJoin(testInviteId);
        await expect(page.locator('h2')).toHaveText('Join - Club Invite');

        const inviteDetails = page.getByTestId('join-invite-details');
        await expect(inviteDetails.getByTestId('join-invite-from')).toContainText('Luca');
        await expect(inviteDetails.getByTestId('join-invite-to')).toContainText('Club Manager');
        await expect(inviteDetails.getByTestId('join-invite-to')).toContainText('Jane Smith');
        await expect(inviteDetails.getByTestId('join-invite-email')).toContainText('jane@example.com');
        await expect(inviteDetails.getByTestId('join-invite-club')).toContainText('Morpeth TTC');
        await expect(inviteDetails.getByTestId('join-invite-club')).toContainText('London');
        await expect(inviteDetails.getByTestId('join-invite-league-season')).toContainText('Local League');
        await expect(inviteDetails.getByTestId('join-invite-league-season')).toContainText('Winter 2024');

        const registerButton = page.getByTestId('join-register-button');
        await expect(registerButton).toBeVisible();
    });

    test('should disable register and hide email when invite already accepted (mocked)', async ({ page }) => {
        const user = new User(page);
        const acceptedInviteId = 'accepted-invite';
        const inviteeEmail = 'john@example.com';

        await page.route(`**/invites/${acceptedInviteId}`, async (route) => {
            const json = new TestInviteBuilder(acceptedInviteId)
                .withRole('CAPTAIN')
                .withEmail(inviteeEmail)
                .asAccepted(1735776000)
                .build();
            await route.fulfill({ json });
        });

        await user.navigateToJoin(acceptedInviteId);

        await expect(page.getByTestId('join-invite-email')).not.toBeVisible();

        const registerButton = page.getByTestId('join-register-button');
        await expect(registerButton).toBeVisible();
        await expect(registerButton).toBeDisabled();

        await expect(page.getByTestId('join-invite-redeemed-error')).toBeVisible();
    });

    test('should show invalid link error for malformed nano_id', async ({ page }) => {
        const user = new User(page);
        await page.route('**/invites/short', async (route) => {
            await route.fulfill({
                status: 400,
                body: 'nano_id malformed.'
            });
        });

        await user.navigateToJoin('short');
        await expect(page.getByTestId('join-error-message')).toContainText('Please check this invitation link');
        await expect(page.getByTestId('join-retry-button')).not.toBeVisible();
    });

    test('should show invitation not found error for nonexistent nano_id', async ({ page }) => {
        const user = new User(page);
        await page.route('**/invites/nonexistent', async (route) => {
            await route.fulfill({
                status: 404,
                body: 'Invite not found'
            });
        });

        await user.navigateToJoin('nonexistent');
        await expect(page.getByTestId('join-error-message')).toContainText('This invitation cannot be found');
        await expect(page.getByTestId('join-retry-button')).not.toBeVisible();
    });
});

const validPassword = 'aA1!56789012';

test.describe('Join with Invite Flow', () => {
    const inviteId = 'test-invite-123';
    const standardUserEmail = 'test_already_registered4@user.test';
    
    const speedUpTimers = async (page: Page, clampAboveMs: number, clampBelowOrEqualMs?: number) => {
        await page.addInitScript(({
            clampAboveMs: clampAboveMsNode,
            clampBelowOrEqualMs: clampBelowOrEqualMsNode
        }) => {
            const originalSetTimeout = window.setTimeout;
            const originalSetInterval = window.setInterval;
            const clampMs = (ms?: number) => {
                if (typeof ms !== 'number') return ms;
                const isAbove = ms > clampAboveMsNode;
                const isBelowOrEqual = typeof clampBelowOrEqualMsNode === 'number' ? ms <= clampBelowOrEqualMsNode : true;
                return isAbove && isBelowOrEqual ? Math.min(ms, 10) : ms;
            };
            window.setTimeout = ((handler: TimerHandler, timeout?: number) => originalSetTimeout(handler, clampMs(timeout))) as typeof window.setTimeout;
            window.setInterval = ((handler: TimerHandler, timeout?: number) => originalSetInterval(handler, clampMs(timeout))) as typeof window.setInterval;
        }, { clampAboveMs, clampBelowOrEqualMs });
    };

    const setupInviteMocks = async (page: Page, invite: Record<string, unknown>, patchStatus = 200) => {
        let patchCalled = 0;
        await page.route(`**/invites/${String(invite.nano_id)}`, async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({ json: invite });
            } else if (method === 'PATCH') {
                patchCalled++;
                await route.fulfill({
                    status: patchStatus,
                    json: { ...invite, status: 'ACCEPTED' }
                });
            }
        });
        return { getPatchCalled: () => patchCalled };
    };


    test('happy path - already registered user, logs in then accepts', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        
        const email = standardUserEmail;
        const invite = new TestInviteBuilder(inviteId)
            .asClubManager('Morpeth TTC', 'London')
            .withName('John Doe')
            .withEmail(email)
            .withSeason('2025')
            .withAlreadyRegistered()
            .build();

        const { getPatchCalled } = await setupInviteMocks(page, invite);

        const user = new User(page);
        await (await user.navigateToLogin()).loginAndWaitForHome(email, validPassword);

        const joinPage = await user.navigateToJoin(inviteId);
        await expect(page.locator('h2')).toHaveText(/^Accept/);

        await joinPage.authenticatedUserAcceptInvite();
        
        expect(getPatchCalled()).toBe(1);
    });

    test('happy path - unauthenticated registered user uses "Login & Accept"', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        const email = standardUserEmail;
        const invite = new TestInviteBuilder(inviteId)
            .asClubManager('Morpeth TTC', 'London')
            .withName('John Doe')
            .withEmail(email)
            .withSeason('2025')
            .withAlreadyRegistered()
            .build();

        await setupInviteMocks(page, invite);

        const nonAuthentcateduser = new User(page);
        let joinPage = await nonAuthentcateduser.navigateToJoin(inviteId);
        
        const loginPage = await joinPage.loginAndAccept();

        joinPage =  await loginPage.loginnAndWaitForJoin(email, validPassword, inviteId);

        await joinPage.authenticatedUserAcceptInvite();
    });

    test('mismatched email error - logged in with wrong account', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        const userEmail = 'test_already_registered4@user.test';
        const inviteEmail = "a_different_email@user.test";
        const invite = new TestInviteBuilder(inviteId)
            .withEmail(inviteEmail)
            .withName('Correct User')
            .withTeam('Team A', 'Div 1')
            .withLeague('League')
            .withSeason('2025')
            .build();

        await setupInviteMocks(page, invite);

        const user = new User(page);
        await (await user.navigateToLogin()).loginAndWaitForHome(userEmail, validPassword);        

        await user.navigateToJoin(inviteId);
        const mismatchError = page.getByTestId('join-email-mismatch-error');
        await expect(mismatchError).toBeVisible();
    });

    test('menu refresh - verify updated state after acceptance', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        const email = standardUserEmail;
        const invite = new TestInviteBuilder(inviteId)
            .asClubManager('New Club', 'London')
            .withName('John')
            .withEmail(email)
            .withLeague('New League')
            .withSeason('2025')
            .withAlreadyRegistered()
            .build();

        await setupInviteMocks(page, invite);
        
        let cognitoMockReturnManagedClubs = false;
        await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
            const target = route.request().headers()['x-amz-target'];
            if (target.endsWith('.GetUser')) {
                const attributes = [
                    { Name: 'email', Value: email },
                    { Name: 'sub', Value: 'mock-sub' }
                ];

                if (cognitoMockReturnManagedClubs) {
                    attributes.push({
                        Name: 'custom:managed_clubs',
                        Value: JSON.stringify([{
                            league: invite.league,
                            season: invite.season,
                            club_name: invite.invitee_club,
                            club_location: invite.club_location,
                            manager_name: invite.invited_by
                        }])
                    });
                }

                await route.fulfill({
                    status: 200,
                    contentType: 'application/x-amz-json-1.1',
                    body: JSON.stringify({ UserAttributes: attributes })
                });
            } else {
                await route.continue();
            }
        });

        const user = new User(page);
        await (await user.navigateToLogin()).loginAndWaitForHome(email, validPassword);

        const joinPage = await user.navigateToJoin(inviteId);
        
        cognitoMockReturnManagedClubs = true;
        await joinPage.authenticatedUserAcceptInvite();

        await user.menu.open(); 
        await user.menu.UserHeaderContainsManagedClub();
    });

    const runAcceptInviteFailureTest = async (page: Page, status: number, expectedCalls = 1) => {
        const email = standardUserEmail;
        const invite = new TestInviteBuilder(inviteId)
            .withName('John')
            .withEmail(email)
            .withTeam('Team', '1')
            .withLeague('L')
            .withSeason('S')
            .build();

        const { getPatchCalled } = await setupInviteMocks(page, invite, status);

        const user = new User(page);
        await (await user.navigateToLogin()).loginAndWaitForHome(email, validPassword);

        const joinPage = await user.navigateToJoin(inviteId);
        await joinPage.tryAuthenticatedUserAcceptInvite();

        // Wait until all expected PATCH attempts have happened (initial call + any retries).
        await expect
            .poll(() => getPatchCalled(), { timeout: 15000 })
            .toBe(expectedCalls);

        expect(getPatchCalled()).toBe(expectedCalls);

        await expect(page.getByTestId('join-accept-invite-error')).toBeVisible({ timeout: 20000 });
    };

    test('failure - Accept Invite NotFound 404 error', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        await runAcceptInviteFailureTest(page, 404);
    });

    test('failure - Accept Invite BadRequest 400 error', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        await runAcceptInviteFailureTest(page, 400);
    });

    test('failure - Accept Invite Forbidden 403 error', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        await runAcceptInviteFailureTest(page, 403);
    });

    test('failure with retries - Accept Invite UnprocessableEntity 422', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // Clamp only the 10s retry delay used by useAcceptInvite, without affecting apiFetch request timeouts.
        await speedUpTimers(page, 9000, 11000);
        await runAcceptInviteFailureTest(page, 422, 3);
    });

    test('failure (with internal API retries) - Accept Invite ServiceUnavailable 503', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        await runAcceptInviteFailureTest(page, 503, 4);
    });

    test('failure with retries - Accept Invite InternalServerError 500', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // Clamp only the 10s retry delay used by useAcceptInvite, without affecting apiFetch request timeouts.
        await speedUpTimers(page, 9000, 11000);
        await runAcceptInviteFailureTest(page, 500, 3);
    });
});
