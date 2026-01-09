import { test, expect } from '@playwright/test';

test.describe('Join Page', () => {
    const testInviteId = '6ipEOiGEL6';

    test('should show loading state', async ({ page }) => {
        // Navigate to a valid-looking invite URL
        await page.goto(`/#/join/${testInviteId}`);

        // Check title
        await expect(page).toHaveTitle('Join - Personal Invite');

        // Check for "Join - Personal Invite" header (h2)
        await expect(page.locator('h2')).toHaveText('Join - Personal Invite');

        // Wait for the fetch to either succeed or fail.
        await expect(page.getByTestId('join-loading-message')).not.toBeVisible({ timeout: 10000 });
    });

    test('should display invite details when successful (mocked)', async ({ page }) => {
        // Mock the API response
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

        await page.goto(`/#/join/${testInviteId}`);

        // Verify invite details using stable container locators
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

    test('should disable register and hide email when invite already accepted (mocked)', async ({ page }) => {
        const acceptedInviteId = 'accepted-invite';
        const inviteeEmail = 'john@example.com';

        await page.route(`**/invites/${acceptedInviteId}`, async (route) => {
            const json = {
                nano_id: acceptedInviteId,
                invitee_name: 'John Doe',
                invitee_email_id: inviteeEmail,
                invitee_role: 'CAPTAIN',
                invitee_team: 'The Smashers',
                team_division: 'Premier',
                league: 'Local League',
                season: 'Winter 2024',
                invited_by: 'Luca',
                accepted_at: 1735776000
            };
            await route.fulfill({ json });
        });

        await page.goto(`/#/join/${acceptedInviteId}`);

        await expect(page.getByTestId('join-invite-email')).not.toBeVisible();

        const registerButton = page.getByTestId('join-register-button');
        await expect(registerButton).toBeVisible();
        await expect(registerButton).toBeDisabled();

        await expect(page.getByTestId('join-invite-redeemed-error')).toBeVisible();
    });

    test('should show invalid link error for malformed nano_id', async ({ page }) => {
        // Mock 400 response for malformed nano_id
        await page.route('**/invites/short', async (route) => {
            await route.fulfill({
                status: 400,
                body: 'nano_id malformed.'
            });
        });

        await page.goto('/#/join/short');

        // Wait for error message to appear using stable test-id
        await expect(page.getByTestId('join-error-message')).toContainText('Please check this invitation link');
        await expect(page.getByTestId('join-error-message')).toContainText('it appears to be incorrect');

        // Verify no retry button is shown
        await expect(page.getByTestId('join-retry-button')).not.toBeVisible();
    });

    test('should show invitation not found error for nonexistent nano_id', async ({ page }) => {
        // Mock 404 response for nonexistent nano_id
        await page.route('**/invites/nonexistent', async (route) => {
            await route.fulfill({
                status: 404,
                body: 'Invite not found'
            });
        });

        await page.goto('/#/join/nonexistent');

        // Wait for error message to appear using stable test-id
        await expect(page.getByTestId('join-error-message')).toContainText('This invitation cannot be found');
        await expect(page.getByTestId('join-error-message')).toContainText('may have expired');

        // Verify no retry button is shown
        await expect(page.getByTestId('join-retry-button')).not.toBeVisible();
    });
});
