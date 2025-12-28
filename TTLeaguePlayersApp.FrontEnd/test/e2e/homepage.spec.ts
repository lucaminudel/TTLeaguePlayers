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

    test('hamburger menu interactions', async ({ page }) => {
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
    });
});
