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

    /** Waits until the teams have loaded, so callers never assert against the loading state. */
    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('My Club Teams');
        await expect(this.page.getByTestId('club-teams-loading')).toHaveCount(0);
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
