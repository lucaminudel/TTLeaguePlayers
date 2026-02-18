import { type Page, expect } from '@playwright/test';

export class ForumsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('Forums');
    }
}
