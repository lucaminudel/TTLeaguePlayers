import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should display initial app state and messages', async ({ page }) => {
        // checks that the is the app name: TT League Players
        await expect(page.locator('h1')).toHaveText('TT League Players');

        // checks that the is the welcome message: Welcome
        await expect(page.locator('h2')).toHaveText('Welcome');

        // checks that the is the welcome sub-message
        await expect(page.locator('main')).toContainText('To this online-community of local leagues Table Tennis players');

        // checks that the is the Enter button
        const enterButton = page.getByRole('button', { name: 'Enter', exact: true });
        await expect(enterButton).toBeVisible();
    });

    test('when clicking the hamburger menu should show all the menu items', async ({ page }) => {
        // checks that the is the menu hamburger
        const menuButton = page.getByRole('button', { name: 'Toggle Menu' });
        await expect(menuButton).toBeVisible();

        // the the menu opens up clicking the menu hamburger
        await menuButton.click();

        // that all menu items are present and are visiblised in the whole page
        const menuItems = [
            'Log in',
            'Kudos standings',
            'Forum',
            'Tournaments',
            'Clubs'
        ];

        for (const item of menuItems) {
            const link = page.getByRole('link', { name: item, exact: true });
            await expect(link).toBeVisible();
        }

        // Verify menu is visualized over the current page
        const navigation = page.locator('nav').filter({ hasText: 'Log in' });
        const overlay = navigation.locator('xpath=..');

        // Check strict geometry: overlay must cover the entire viewport
        const viewportSize = page.viewportSize();
        expect(viewportSize).not.toBeNull();

        const overlayBox = await overlay.boundingBox();
        expect(overlayBox).not.toBeNull();

        // Allow for small rounding differences if necessary, but fixed inset-0 should be exact
        expect(overlayBox!.x).toBe(0);
        expect(overlayBox!.y).toBe(0);
        expect(overlayBox!.width).toBe(viewportSize!.width);
        expect(overlayBox!.height).toBe(viewportSize!.height);

        // Verify menu items are all centred
        await expect(overlay).toHaveCSS('display', 'flex');
        await expect(overlay).toHaveCSS('flex-direction', 'column');
        await expect(overlay).toHaveCSS('justify-content', 'center');
        await expect(overlay).toHaveCSS('align-items', 'center');
    });
});
