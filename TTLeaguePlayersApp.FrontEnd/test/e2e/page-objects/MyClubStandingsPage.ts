import { type Page, type Locator, expect } from '@playwright/test';

type InfoModalMode = 'ok' | 'tick-and-ok' | 'expect-absent';

/**
 * Lean by design: actions and stability checks only, no assertion methods.
 * Assertions on the rendered data belong in the spec (WriteTestsGuidelines).
 */
export class MyClubStandingsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    infoModal(): Locator {
        return this.page.getByTestId('standings-info-modal');
    }

    websiteInfoModal(): Locator {
        return this.page.getByTestId('standings-website-info-modal');
    }

    async dismissInfoModal(tickDontShowAgain: boolean): Promise<void> {
        await expect(this.websiteInfoModal()).toBeVisible({ timeout: 10000 });
        if (tickDontShowAgain) {
            await this.page.getByTestId('standings-website-info-modal-dont-show-again').check();
        }
        await this.page.getByTestId('standings-website-info-modal-ok').click();
        await expect(this.websiteInfoModal()).toBeHidden();

        await expect(this.infoModal()).toBeVisible({ timeout: 10000 });
        if (tickDontShowAgain) {
            await this.page.getByTestId('standings-info-modal-dont-show-again').check();
        }
        await this.page.getByTestId('standings-info-modal-ok').click();
        await expect(this.infoModal()).toBeHidden();
    }

    /**
     * Waits until the standings have loaded, so callers never assert against the loading state.
     *
     * The 15 s is NOT padding against flakiness - it is sized to outlast the club-page fetcher's own
     * retry budget. CLTTLActiveSeason2025PagesFetcher.fetchWithRetry makes 3 attempts with a 2000 ms
     * sleep between them, so a club page that cannot be read keeps the spinner up for ~4 s BY
     * DESIGN. Playwright's implicit 5 s left under a second of headroom, and the club-page-unreadable
     * test failed or passed depending on how loaded the parallel workers were.
     */
    private static readonly LOADED_TIMEOUT_MS = 15_000;

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('My Club Standings');
        await expect(this.page.getByTestId('club-standings-loading'))
            .toHaveCount(0, { timeout: MyClubStandingsPage.LOADED_TIMEOUT_MS });
    }

    /**
     * The default-mode card labels its buttons "location / league".
     * Verifies the selection took and the card heading followed, then waits for the load to settle.
     */
    async selectClub(location: string, league: string, clubName: string, infoModal: InfoModalMode = 'ok'): Promise<void> {
        const clubButton = this.page.getByRole('button', { name: `${location} / ${league}` });
        await clubButton.click();

        await expect(clubButton).toHaveClass(/bg-action-accent/);
        await expect(this.page.getByRole('heading', { name: new RegExp(`My Club: ${clubName}`, 'i') })).toBeVisible();

        await this.expectLoaded();

        if (infoModal === 'expect-absent') {
            // expectLoaded() above is the positive signal: toBeHidden() alone is satisfied at t=0,
            // before React could have rendered the modal, so it would pass even if the modal did
            // appear.
            await expect(this.websiteInfoModal()).toBeHidden();
            await expect(this.infoModal()).toBeHidden();
        } else {
            await this.dismissInfoModal(infoModal === 'tick-and-ok');
        }
    }
}
