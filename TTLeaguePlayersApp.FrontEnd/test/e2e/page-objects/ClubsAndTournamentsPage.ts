import { type Page, expect } from '@playwright/test';

export class ClubsAndTournamentsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('Clubs & Tournaments');
        await expect(this.page.getByText('Loading clubs and tournaments…')).not.toBeVisible({ timeout: 10000 });
        await expect(this.page.getByTestId('tournaments-section')).toBeVisible();
        await expect(this.page.getByTestId('clubs-section')).toBeVisible();
    }
}
