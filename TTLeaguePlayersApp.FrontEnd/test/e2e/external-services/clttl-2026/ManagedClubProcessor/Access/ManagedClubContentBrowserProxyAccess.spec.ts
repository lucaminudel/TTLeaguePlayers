import { test, expect } from '@playwright/test';

test.describe('CLTTL managed-club browser/proxy access', () => {
    test('consumes live club teams and divisions through a successful proxy response', async ({ page }) => {
        test.slow();
        const proxyResponse = page.waitForResponse(response => response.ok() && new URL(response.url()).searchParams.get('url') === 'https://www.tabletennis365.com/CentralLondon/Clubs/Morpeth');
        await page.goto('/#/external-contracts-live?contract=managed-club');
        expect((await proxyResponse).ok()).toBe(true);
        await expect(page.getByTestId('external-contract-status')).toHaveText('ready');
        await expect(page.getByTestId('external-contract-season')).toHaveText('CLTTL 2026-2027');
        await expect(page.getByTestId('external-contract-club')).toHaveText('Morpeth Table Tennis Club');
        await expect(page.getByTestId('external-contract-club-team-count')).toHaveText(/^Club teams: [1-9]\d*$/);
        const teamNames = page.getByTestId('external-contract-club-team-name');
        const teamDivisions = page.getByTestId('external-contract-club-team-division');
        await expect(teamNames.first()).toBeVisible();
        const names = await teamNames.allTextContents();
        const divisions = await teamDivisions.allTextContents();
        expect(divisions).toHaveLength(names.length);
        for (const value of names) expect(value).toMatch(/\S/);
        for (const division of divisions) {
            expect(division).toMatch(/^(Premier|Division [1-7])$/);
        }
        await expect(page.getByTestId('external-contract-club-team-count')).toHaveText(`Club teams: ${String(names.length)}`);
        await expect(page.getByTestId('external-contract-team-player-json')).toHaveCount(0);
    });
});
