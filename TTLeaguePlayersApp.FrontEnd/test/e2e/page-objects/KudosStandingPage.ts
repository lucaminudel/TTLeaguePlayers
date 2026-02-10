import { type Page,  expect } from '@playwright/test';

export class KudosStandingPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async expectIsVisible(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('Fair play Kudos');
    }

}
