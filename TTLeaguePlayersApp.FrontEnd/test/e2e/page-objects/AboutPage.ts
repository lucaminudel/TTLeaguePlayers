import { type Page, expect } from '@playwright/test';

export class AboutPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async expectLoaded(): Promise<void> {
        await expect(this.page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
        await expect(this.page.locator('main')).toContainText('This App is created by Table Tennis players for Table Tennis players');
    }

    async getEmail(): Promise<string | null> {
        const emailLink = this.page.getByTestId('about-email-link');
        return await emailLink.textContent();
    }
}
