import { type Page, expect } from '@playwright/test';

/**
 * Lean by design: actions and stability checks only, no assertion methods.
 * Assertions on the rendered data belong in the spec (WriteTestsGuidelines).
 */
export class MyClubTeamsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Waits until the teams have loaded, so callers never assert against the loading state.
     *
     * The 15 s is NOT padding against flakiness - it is sized to outlast the club-page fetcher's own
     * retry budget. CLTTLActiveSeason2025PagesFetcher.fetchWithRetry makes 3 attempts with a 2000 ms
     * sleep between them, so a club page that cannot be read keeps the spinner up for ~4 s BY
     * DESIGN. Playwright's implicit 5 s left under a second of headroom, and the
     * club-page-unreadable test at MyClubTeams.spec.ts:103 was passing on margin alone.
     * Kept identical to MyClubStandingsPage, which hit exactly this and failed under worker load.
     */
    private static readonly LOADED_TIMEOUT_MS = 15_000;

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('My Club Teams');
        await expect(this.page.getByTestId('club-teams-loading'))
            .toHaveCount(0, { timeout: MyClubTeamsPage.LOADED_TIMEOUT_MS });
    }

    /**
     * The default-mode card labels its buttons "location / league".
     * Verifies the selection took and the card heading followed, then waits for the load to settle.
     */
    async selectClub(location: string, league: string, clubName: string): Promise<void> {
        const clubButton = this.page.getByRole('button', { name: `${location} / ${league}` });
        await clubButton.click();

        await expect(clubButton).toHaveClass(/bg-action-accent/);
        await expect(this.page.getByRole('heading', { name: new RegExp(`My Club: ${clubName}`, 'i') })).toBeVisible();

        await this.expectLoaded();
    }
}
