import { test, expect } from '@playwright/test';

test.describe('CLTTL active-season browser/proxy access', () => {
    test('consumes live fixture, selector and representative player data through successful proxy responses', async ({ page }) => {
        test.slow();
        const eligibilityUrl = 'https://www.tabletennis365.com/CentralLondon/Team/Eligibility';
        const proxyResponses = Promise.all([
            page.waitForResponse(response => response.ok() && new URL(response.url()).searchParams.get('url') === 'https://www.tabletennis365.com/CentralLondon/Fixtures/calendar.ics?d=9761'),
            page.waitForResponse(response => response.ok() && new URL(response.url()).searchParams.get('url') === eligibilityUrl),
            page.waitForResponse(response => {
                if (!response.ok()) return false;
                const target = new URL(response.url()).searchParams.get('url');
                if (!target?.startsWith(eligibilityUrl + '?')) return false;
                const params = new URL(target).searchParams;
                return params.get('handler') === 'Players' && params.get('leagueId') === '4760' && /^[1-9]\d*$/.test(params.get('teamId') ?? '');
            }),
        ]);
        await page.goto('/#/external-contracts-live');
        for (const response of await proxyResponses) {
            expect(response.ok()).toBe(true);
        }
        await expect(page.getByTestId('external-contract-status')).toHaveText('ready');
        await expect(page.getByTestId('external-contract-season')).toHaveText('CLTTL 2026-2027');
        await expect(page.getByTestId('external-contract-fixture-calendar')).toHaveText(/^Fixtures: [1-9]\d*$/);
        await expect(page.getByTestId('external-contract-team-selector')).toHaveText(/^Team options: [1-9]\d*$/);
        await expect(page.getByTestId('external-contract-selected-team')).toHaveText('Morpeth 10');
        await expect(page.getByTestId('external-contract-team-player-json')).toHaveText(/^Player names: [1-9]\d*$/);
        const playerNames = page.getByTestId('external-contract-player-name');
        await expect(playerNames.first()).toBeVisible();
        const names = await playerNames.allTextContents();
        for (const name of names) expect(name).toMatch(/\S/);
        await expect(page.getByTestId('external-contract-team-player-json')).toHaveText(`Player names: ${String(names.length)}`);
    });
});
