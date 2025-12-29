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
        await expect(page.locator('text=Waiting for a response...')).not.toBeVisible({ timeout: 10000 });
    });

    test('should display invite details when successful (mocked)', async ({ page }) => {
        // Mock the API response
        await page.route('**/invites/*', async (route) => {
            const json = {
                nano_id: testInviteId,
                name: 'John Doe',
                email_ID: 'john@example.com',
                role: 'CAPTAIN',
                team_name: 'The Smashers',
                division: 'Premier',
                league: 'Local League',
                season: 'Winter 2024'
            };
            await route.fulfill({ json });
        });

        await page.goto(`/#/join/${testInviteId}`);

        // Verify details
        await expect(page.locator('text=Team Captain')).toBeVisible();
        await expect(page.locator('text=John Doe')).toBeVisible();
        await expect(page.locator('text=john@example.com')).toBeVisible();
        await expect(page.locator('text=The Smashers, Premier')).toBeVisible();
        await expect(page.locator('text=Local League Winter 2024')).toBeVisible();

        const registerButton = page.getByRole('button', { name: 'Register', exact: true });
        await expect(registerButton).toBeVisible();
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

        // Wait for error message to appear
        await expect(page.locator('text=Please check this invitation link; it appears to be incorrect, missing characters, or containing extra ones.')).toBeVisible();
        
        // Verify no retry button is shown
        await expect(page.getByRole('button', { name: 'Retry' })).not.toBeVisible();
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

        // Wait for error message to appear
        await expect(page.locator('text=This invitation cannot be found. It may have expired, been canceled, or is no longer valid. If you believe this is an error, please contact us.')).toBeVisible();
        
        // Verify no retry button is shown
        await expect(page.getByRole('button', { name: 'Retry' })).not.toBeVisible();
    });
});
