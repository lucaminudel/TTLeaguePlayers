import { test, expect } from '@playwright/test';

test.describe('Join Page', () => {
    const testInviteId = '6ipEOiGEL6';

    test('should show loading state and then error handled (no backend)', async ({ page }) => {
        // Navigate to a valid-looking invite URL
        await page.goto(`/#/join/${testInviteId}`);

        // Check title
        await expect(page).toHaveTitle('Join - Personal Invite');

        // Check for "Join - Personal Invite" header (h2)
        await expect(page.locator('h2')).toHaveText('Join - Personal Invite');

        // Wait for the fetch to either succeed or fail.
        // Since there is no backend by default in this environment, it will likely show an error.
        // For now, we just verify it gets out of loading state.
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
});
