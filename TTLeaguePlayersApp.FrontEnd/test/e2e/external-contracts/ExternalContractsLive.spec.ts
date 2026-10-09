import { test, expect } from '@playwright/test';


test.describe('External contracts live testing', () => {

    test.describe('go.x2u.in proxy', () => {
        test('returns browser-readable team eligibility HTML', async ({ page }) => {
            await page.goto('/#/external-contracts-live');

            await expect(page.getByTestId('external-contract-status')).toHaveText('ready');
            await expect(page.getByTestId('external-contract-team-selector')).toHaveText(/Team options: [1-9]\d*/);
        });

        test('returns browser-readable team-player JSON', async ({ page }) => {
            await page.goto('/#/external-contracts-live');

            await expect(page.getByTestId('external-contract-status')).toHaveText('ready');
            await expect(page.getByTestId('external-contract-team-player-json')).toHaveText(/Player names: \d+/);
        });
    });
});
