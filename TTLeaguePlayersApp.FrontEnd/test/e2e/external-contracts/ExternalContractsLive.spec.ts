import { test, expect } from '@playwright/test';


test.describe('External contracts live testing', () => {
    test('returns the current CLTTL season with browser-readable fixture, team and player contracts', async ({ page }) => {
        await page.goto('/#/external-contracts-live');

        await expect(page.getByTestId('external-contract-status')).toHaveText('ready');
        await expect(page.getByTestId('external-contract-season')).toHaveText('CLTTL 2026-2027');
        await expect(page.getByTestId('external-contract-fixture-calendar')).toHaveText(/Fixtures: [1-9]\d*/);
        await expect(page.getByTestId('external-contract-team-selector')).toHaveText(/Team options: [1-9]\d*/);
        await expect(page.getByTestId('external-contract-team-player-json')).toHaveText(/Player names: \d+/);
    });
});
